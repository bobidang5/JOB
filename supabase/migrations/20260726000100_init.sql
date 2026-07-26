-- 职优 AI —— 初始 schema
--
-- 表结构对应 DESIGN-SPEC 的界面与状态逻辑：
--   profiles          我的 / 个人资料（截图 04、05）
--   resume_templates  模版库的 4 个模版（截图 08），公开只读
--   resumes           我的简历，content 为结构化 JSON
--   resume_versions   每次优化后存一版，供记录回看
--   job_targets       粘贴的 JD（截图 10）
--   analyses          匹配度结果（截图 13）
--   suggestions       逐条优化建议（截图 14）
--   optimizations     一次完整优化 = 「记录」列表的一条（截图 03）

------------------------------------------------------------------
-- 枚举
------------------------------------------------------------------

create type public.resume_source as enum ('upload', 'template');

create type public.analysis_status as enum (
  'pending',   -- 已创建，尚未开始
  'running',   -- 正在调用模型
  'succeeded',
  'failed'
);

create type public.suggestion_status as enum ('pending', 'adopted', 'skipped');

------------------------------------------------------------------
-- 通用触发器
------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------------
-- profiles
------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  -- 求职意向，如「产品经理」
  job_intent text not null default '',
  years_experience smallint check (years_experience is null or years_experience between 0 and 70),
  city text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 注册后自动建 profile，并尽量用 OAuth 返回的资料预填，
-- 这样用户第一次进「我的」就不是一片空白。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------
-- resume_templates（公开只读，种子数据）
------------------------------------------------------------------

create table public.resume_templates (
  -- 'v1'..'v4'，与 packages/shared 的 ResumeTemplateKey 对应
  key text primary key check (key in ('v1', 'v2', 'v3', 'v4')),
  name text not null,
  categories text[] not null default '{}',
  usage_label text not null,
  is_recommended boolean not null default false,
  sort_order smallint not null default 0
);

------------------------------------------------------------------
-- resumes
------------------------------------------------------------------

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 记录列表里显示的文件名，如「产品经理-李婷.pdf」
  title text not null,
  template_key text not null default 'v1'
    references public.resume_templates (key),
  -- ResumeContentSchema 的结构化内容
  content jsonb not null,
  score smallint not null default 0 check (score between 0 and 100),
  source public.resume_source not null,
  -- 上传的原件在 storage 里的路径（从模版新建时为空）
  source_file_path text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resumes_content_is_object check (jsonb_typeof(content) = 'object')
);

create index resumes_user_id_idx on public.resumes (user_id, updated_at desc);

-- 每个用户最多一份默认简历
create unique index resumes_one_default_per_user
  on public.resumes (user_id) where is_default;

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- resume_versions
------------------------------------------------------------------

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content jsonb not null,
  score smallint not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  constraint resume_versions_content_is_object check (jsonb_typeof(content) = 'object')
);

create index resume_versions_resume_id_idx
  on public.resume_versions (resume_id, created_at desc);

------------------------------------------------------------------
-- job_targets
------------------------------------------------------------------

create table public.job_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 从 JD 里抽出来的，如「产品经理（增长方向）」/「字节跳动」
  title text not null default '',
  company text not null default '',
  jd_text text not null,
  created_at timestamptz not null default now(),
  -- DESIGN-SPEC §5.1：少于 50 字不允许分析。前端会先拦一道，
  -- 这里再兜一次，避免绕过界面写入无法分析的数据。
  constraint job_targets_jd_min_length check (char_length(btrim(jd_text)) >= 50)
);

create index job_targets_user_id_idx on public.job_targets (user_id, created_at desc);

------------------------------------------------------------------
-- analyses
------------------------------------------------------------------

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_target_id uuid not null references public.job_targets (id) on delete cascade,
  status public.analysis_status not null default 'pending',
  match_score smallint check (match_score between 0 and 100),
  satisfied_count smallint check (satisfied_count >= 0),
  -- [{"keyword": "SQL", "count": 4}, ...]
  missing_keywords jsonb not null default '[]'::jsonb,
  -- 分析发起时简历的分数，完成页左边那个数字
  base_score smallint not null check (base_score between 0 and 100),
  -- 全部采纳后的上限，完成页右边那个数字的天花板
  max_score smallint check (max_score between 0 and 100),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint analyses_missing_keywords_is_array
    check (jsonb_typeof(missing_keywords) = 'array')
);

create index analyses_user_id_idx on public.analyses (user_id, created_at desc);
create index analyses_resume_id_idx on public.analyses (resume_id);

------------------------------------------------------------------
-- suggestions
------------------------------------------------------------------

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  -- 界面上的顺序（「1 / 4」的进度）
  position smallint not null,
  tag text not null,
  original_text text not null,
  suggested_text text not null,
  -- 需要用主色高亮的子串，对应原型 neu 字段里的 <b>
  emphasis text[] not null default '{}',
  rationale text not null,
  score_delta smallint not null default 0 check (score_delta >= 0),
  -- 只允许 packages/shared 白名单里的四种形式
  field_path text not null check (
    field_path in ('summary', 'skills')
    or field_path ~ '^exp\[\d+\]\.lis\[\d+\]$'
    or field_path ~ '^projects\[\d+\]\.lis\[\d+\]$'
  ),
  status public.suggestion_status not null default 'pending',
  unique (analysis_id, position)
);

create index suggestions_analysis_id_idx
  on public.suggestions (analysis_id, position);

------------------------------------------------------------------
-- optimizations（「记录」列表的一条）
------------------------------------------------------------------

create table public.optimizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid not null unique references public.analyses (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  resume_version_id uuid references public.resume_versions (id) on delete set null,
  adopted_count smallint not null default 0 check (adopted_count >= 0),
  score_before smallint not null check (score_before between 0 and 100),
  score_after smallint not null check (score_after between 0 and 100),
  created_at timestamptz not null default now(),
  constraint optimizations_score_not_decreasing check (score_after >= score_before)
);

create index optimizations_user_id_idx
  on public.optimizations (user_id, created_at desc);

------------------------------------------------------------------
-- Row Level Security
--
-- 策略里一律写 (select auth.uid()) 而不是裸 auth.uid()：这样规划器把它
-- 当 InitPlan 求值一次，而不是每行调一次函数。
------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.resumes           enable row level security;
alter table public.resume_versions   enable row level security;
alter table public.job_targets       enable row level security;
alter table public.analyses          enable row level security;
alter table public.suggestions       enable row level security;
alter table public.optimizations     enable row level security;
alter table public.resume_templates  enable row level security;

-- profiles：主键就是 user id
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- 下面这些表都有 user_id
create policy "resumes_all_own" on public.resumes
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "resume_versions_all_own" on public.resume_versions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "job_targets_all_own" on public.job_targets
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "analyses_all_own" on public.analyses
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "optimizations_all_own" on public.optimizations
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- suggestions 没有 user_id，经 analysis 判断归属
create policy "suggestions_all_via_analysis" on public.suggestions
  for all to authenticated
  using (
    exists (
      select 1 from public.analyses a
      where a.id = suggestions.analysis_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.analyses a
      where a.id = suggestions.analysis_id
        and a.user_id = (select auth.uid())
    )
  );

-- 模版对所有人只读，没有任何写策略
create policy "resume_templates_read_all" on public.resume_templates
  for select to anon, authenticated using (true);

------------------------------------------------------------------
-- Storage
------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('resume-files', 'resume-files', false, 20971520,
   array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/msword',
     'image/jpeg',
     'image/png',
     'image/webp'
   ])
on conflict (id) do nothing;

-- 两个 bucket 都按 {user_id}/... 分目录，比对路径首段。
create policy "avatars_own_folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "resume_files_own_folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'resume-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'resume-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
