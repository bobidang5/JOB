-- 职优 AI —— 运营后台
--
-- 三件事：
--   admin_users / admin_audit_log   后台登录与操作留痕
--   ai_providers                    接入哪个平台、哪个模型、哪把 key
--   ai_usage                        每次模型调用的用量，后台各项指标的来源
--
-- 信任边界与前台不同，务必看清楚：
--
-- 前台那些接口走「anon key + 用户自己的 JWT」，RLS 是安全边界，即便某条
-- 路由的归属判断写错了数据库也会兜住（见 apps/web/lib/supabase.ts）。
-- 后台反过来——它要跨所有用户做汇总，按定义就越过了 RLS，所以只能用
-- service_role。因此本文件建的表一律「启用 RLS 但不给任何策略」：
-- anon 与 authenticated 一条都读不到，service_role 才能访问。
-- 唯一的例外是 ai_usage 的写入，理由见那一节。

------------------------------------------------------------------
-- 枚举
------------------------------------------------------------------

-- 接入方式，不是「厂商」。各家平台绝大多数都提供 OpenAI 兼容端点，
-- 按协议分类才不会每加一家就改一次枚举。
create type public.ai_protocol as enum (
  'anthropic',         -- Anthropic 原生 SDK
  'openai_compatible'  -- OpenAI /chat/completions 兼容端点
);

create type public.ai_call_kind as enum (
  'parse',    -- 简历解析
  'analyze',  -- 匹配度 + 优化建议
  'draft'     -- 从模版起草
);

create type public.ai_call_status as enum (
  'ok',
  'refusal',   -- 模型拒答，不是错误
  'contract',  -- 返回不符合 Zod 契约
  'error'      -- 网络/鉴权/限流等
);

create type public.admin_action as enum (
  'login',
  'login_failed',
  'logout',
  'password_changed',
  'provider_created',
  'provider_updated',
  'provider_deleted',
  'provider_activated',
  'provider_tested'
);

------------------------------------------------------------------
-- admin_users
------------------------------------------------------------------

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (char_length(username) between 3 and 32),
  -- scrypt$N$r$p$base64(salt)$base64(hash)，校验见 apps/web/lib/admin/password.ts
  password_hash text not null,
  -- 仍在用出厂口令。后台顶部据此挂警告条
  is_default_password boolean not null default false,
  -- 改密后自增，用来让已签发的会话 cookie 立刻失效
  token_version integer not null default 0,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
-- 无策略：只有 service_role 能读写

-- 出厂管理员。
--
-- 口令 abc123 是需求方指定的，这里存的是它的 scrypt 哈希——仓库和数据库
-- 里都不出现明文，校验走的也是和用户自己改密之后完全相同的那条路径。
-- is_default_password 为 true 会让后台一直挂着警告条。
--
-- 公网部署前必须改掉。这行不是「安全措施」，它只是让开箱即用这件事
-- 不至于顺手把明文口令写进 git。
insert into public.admin_users (username, password_hash, is_default_password)
values (
  'admin',
  'scrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
  true
)
on conflict (username) do nothing;

------------------------------------------------------------------
-- ai_providers
------------------------------------------------------------------

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  -- 后台列表里显示的名字，如「Anthropic 生产」「DeepSeek 备用」
  label text not null check (char_length(label) between 1 and 64),
  -- 平台标识，与 apps/web/lib/ai/catalog.ts 的 PLATFORMS 对应
  platform text not null check (char_length(platform) between 1 and 40),
  protocol public.ai_protocol not null,
  model text not null check (char_length(model) between 1 and 120),
  -- openai_compatible 必填；anthropic 留空走官方端点
  base_url text,
  -- AES-256-GCM 密文，格式 v1.iv.tag.ciphertext（base64url）
  -- 明文 key 绝不出库、绝不回传给浏览器，见 apps/web/lib/admin/secrets.ts
  api_key_cipher text not null,
  -- 后台列表里显示 ****1234，用来核对填的是哪把 key
  api_key_last4 text not null check (char_length(api_key_last4) <= 4),
  -- 只有 anthropic 协议吃这个；其余平台忽略
  effort text not null default 'high'
    check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  is_active boolean not null default false,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- openai_compatible 必须有 base_url，否则不知道往哪儿发
  constraint ai_providers_base_url_required check (
    protocol <> 'openai_compatible' or (base_url is not null and base_url <> '')
  )
);

-- 同一时刻只能有一个启用的接入。部分唯一索引让「两个都启用」这种状态
-- 在数据库层面就不可能出现，省得应用代码里再写一遍互斥。
create unique index ai_providers_single_active
  on public.ai_providers ((true)) where is_active;

create trigger ai_providers_set_updated_at
  before update on public.ai_providers
  for each row execute function public.set_updated_at();

alter table public.ai_providers enable row level security;
-- 无策略：密文和配置只有 service_role 能碰

------------------------------------------------------------------
-- ai_usage
------------------------------------------------------------------

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  -- 用户注销后保留用量行，所以是 set null 而不是 cascade：
  -- 「这个月调了多少次」不该因为有人销号就凭空少一截
  user_id uuid references auth.users (id) on delete set null,
  kind public.ai_call_kind not null,
  -- 冗余记下当时用的平台/模型，而不是外键指向 ai_providers。
  -- 配置会被改被删，历史用量不该跟着变形
  platform text not null,
  model text not null,
  status public.ai_call_status not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- 缓存读命中的输入 token，单列出来才能看出缓存有没有省到钱
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  -- 失败时的分类标识（不放原始报错，那里可能带简历片段）
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_usage_created_at_idx on public.ai_usage (created_at desc);
create index ai_usage_user_id_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_status_idx on public.ai_usage (status, created_at desc);

alter table public.ai_usage enable row level security;

-- 唯一的例外：允许用户插入自己的用量行。
--
-- 写入方是前台那几条 API 路由，它们用的是调用者自己的 JWT（刻意不用
-- service_role，见 apps/web/lib/supabase.ts 的说明）。为了记一条用量就
-- 把 service_role 引进前台路由，等于为了埋点拆掉整条安全边界，不值当。
-- 只给 insert 且 with check 钉死 user_id，没有 select 策略——用户写得进去，
-- 读不出来，汇总只有后台（service_role）能做。
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

------------------------------------------------------------------
-- admin_audit_log
------------------------------------------------------------------

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- 管理员被删也要留痕，所以 set null
  admin_user_id uuid references public.admin_users (id) on delete set null,
  -- 冗余存一份用户名：留痕的意义就在于对象没了也查得到
  username text not null,
  action public.admin_action not null,
  -- 改了什么的摘要。绝不放 api key 明文，只放 last4 之类
  detail jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_detail_is_object check (jsonb_typeof(detail) = 'object')
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- 无策略：只有 service_role 能读写

------------------------------------------------------------------
-- 注册用户统计
------------------------------------------------------------------

-- auth.users 不在 supabase-js 能 .from() 的 schema 里，而 auth.admin.listUsers()
-- 只能分页拉全量再自己数——用户上万之后这就成了一次几十轮的往返。
-- 所以在数据库里一次算完。
--
-- security definer 是必需的：调用方需要读 auth.users，但我们不想为此把
-- 那张表暴露出去。函数体只返回计数，不返回任何一行用户数据。
-- 建完立刻收回 public 的执行权限，只留 service_role。
create or replace function public.admin_user_stats()
returns table (
  total bigint,
  new_today bigint,
  new_7d bigint,
  new_30d bigint,
  confirmed bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    count(*),
    count(*) filter (where u.created_at >= date_trunc('day', now())),
    count(*) filter (where u.created_at >= now() - interval '7 days'),
    count(*) filter (where u.created_at >= now() - interval '30 days'),
    count(*) filter (where u.email_confirmed_at is not null)
  from auth.users u;
$$;

revoke all on function public.admin_user_stats() from public;
revoke all on function public.admin_user_stats() from anon, authenticated;
grant execute on function public.admin_user_stats() to service_role;

-- 按日注册趋势，同样只回计数
create or replace function public.admin_signup_trend(days integer default 30)
returns table (day date, signups bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select d::date, count(u.id)
  from generate_series(
         date_trunc('day', now()) - make_interval(days => greatest(days, 1) - 1),
         date_trunc('day', now()),
         interval '1 day'
       ) d
  left join auth.users u
    on u.created_at >= d and u.created_at < d + interval '1 day'
  group by d
  order by d;
$$;

revoke all on function public.admin_signup_trend(integer) from public;
revoke all on function public.admin_signup_trend(integer) from anon, authenticated;
grant execute on function public.admin_signup_trend(integer) to service_role;
