-- RLS 断言
--
-- 跑法：pnpm db:test（内部是 supabase db reset 之后用 psql 执行本文件）
-- 任何一条断言不成立就 raise exception，配合 -v ON_ERROR_STOP=1 让整个
-- 命令以非零码退出。
--
-- 依赖 seed.sql 里的演示用户 A（李婷）及其 2 份简历 / 2 条记录。

\set ON_ERROR_STOP on

\echo '=== 准备第二个用户 B ==='

do $$
declare
  user_b constant uuid := '99999999-9999-4999-8999-999999999999';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    user_b, 'authenticated', 'authenticated', 'intruder@example.com',
    extensions.crypt('intruder123456', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"入侵者"}'::jsonb
  )
  on conflict (id) do nothing;

  -- B 自己的简历，用来验证「看得到自己的」而不是「什么都看不到」
  insert into public.resumes (id, user_id, title, template_key, content, score, source, is_default)
  values (
    '88888888-8888-4888-8888-888888888888', user_b, 'B的简历.pdf', 'v1',
    '{"name":"B","meta":"","summary":"","exp":[],"projects":[],"edu":"","eduDate":"","skills":""}'::jsonb,
    50, 'template', true
  )
  on conflict (id) do nothing;
end $$;

\echo '=== 用户 A 只看得到自己的数据 ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.resumes;
  if n <> 2 then
    raise exception 'A 应看到自己的 2 份简历，实际 %', n;
  end if;

  select count(*) into n from public.optimizations;
  if n <> 2 then
    raise exception 'A 应看到自己的 2 条记录，实际 %', n;
  end if;

  select count(*) into n from public.analyses;
  if n <> 2 then
    raise exception 'A 应看到自己的 2 条分析，实际 %', n;
  end if;

  select count(*) into n from public.profiles;
  if n <> 1 then
    raise exception 'A 应只看到自己 1 条资料，实际 %', n;
  end if;

  -- B 的简历不能出现在 A 的结果里
  select count(*) into n
  from public.resumes
  where id = '88888888-8888-4888-8888-888888888888';
  if n <> 0 then
    raise exception 'A 竟然能看到 B 的简历';
  end if;
end $$;
rollback;

\echo '=== 用户 B 读不到 A 的任何数据 ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.resumes;
  if n <> 1 then
    raise exception 'B 应只看到自己的 1 份简历，实际 %（RLS 泄漏）', n;
  end if;

  select count(*) into n from public.analyses;
  if n <> 0 then
    raise exception 'B 不该看到任何分析，实际 %', n;
  end if;

  select count(*) into n from public.optimizations;
  if n <> 0 then
    raise exception 'B 不该看到任何记录，实际 %', n;
  end if;

  select count(*) into n from public.job_targets;
  if n <> 0 then
    raise exception 'B 不该看到任何目标职位，实际 %', n;
  end if;

  select count(*) into n from public.resume_versions;
  if n <> 0 then
    raise exception 'B 不该看到任何简历版本，实际 %', n;
  end if;

  -- suggestions 没有 user_id，归属经 analysis_id 判断，单独验一遍
  select count(*) into n from public.suggestions;
  if n <> 0 then
    raise exception 'B 不该看到任何建议，实际 %（经 analysis 的归属判断失效）', n;
  end if;

  select count(*) into n from public.profiles;
  if n <> 1 then
    raise exception 'B 应只看到自己 1 条资料，实际 %', n;
  end if;
end $$;
rollback;

\echo '=== 用户 B 改不动 A 的数据 ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';

do $$
declare
  n int;
begin
  -- UPDATE 命中 0 行（而不是报错），因为 USING 把行过滤掉了
  update public.resumes set score = 100
  where id = '22222222-2222-4222-8222-222222222221';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'B 竟然改动了 A 的简历（% 行）', n;
  end if;

  delete from public.optimizations;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'B 竟然删掉了 A 的记录（% 行）', n;
  end if;
end $$;

-- 冒名插入：把 user_id 写成 A，应被 WITH CHECK 拒绝
do $$
begin
  insert into public.resumes (user_id, title, template_key, content, score, source)
  values (
    '11111111-1111-4111-8111-111111111111', '冒名简历.pdf', 'v1',
    '{"name":"x","meta":"","summary":"","exp":[],"projects":[],"edu":"","eduDate":"","skills":""}'::jsonb,
    1, 'template'
  );
  raise exception 'B 竟然能以 A 的 user_id 插入简历';
exception
  when insufficient_privilege then
    null; -- 预期：违反 RLS 的 WITH CHECK
end $$;
rollback;

\echo '=== 匿名身份：模版只读，其它一律不可见 ==='

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.resume_templates;
  if n <> 4 then
    raise exception '匿名身份应能读到 4 个模版，实际 %', n;
  end if;

  select count(*) into n from public.resumes;
  if n <> 0 then
    raise exception '匿名身份不该看到任何简历，实际 %', n;
  end if;

  select count(*) into n from public.profiles;
  if n <> 0 then
    raise exception '匿名身份不该看到任何资料，实际 %', n;
  end if;
end $$;

-- 模版没有任何写策略，插入应被拒
do $$
begin
  insert into public.resume_templates (key, name, usage_label)
  values ('v1', '伪造模版', 'x');
  raise exception '匿名身份竟然能写入模版表';
exception
  when insufficient_privilege then
    null; -- 预期
end $$;
rollback;

\echo '=== JD 长度约束（DESIGN-SPEC §5.1 的数据库兜底）==='

do $$
begin
  insert into public.job_targets (user_id, jd_text)
  values ('11111111-1111-4111-8111-111111111111', '太短了');
  raise exception '少于 50 字的 JD 竟然写进去了';
exception
  when check_violation then
    null; -- 预期
end $$;

\echo '=== field_path 约束（只认白名单里的四种形式）==='

do $$
declare
  bad_path text;
begin
  foreach bad_path in array array['name', '__proto__', 'exp[0]', 'exp.lis[0]'] loop
    begin
      insert into public.suggestions (
        analysis_id, position, tag, original_text, suggested_text, rationale, field_path
      ) values (
        '44444444-4444-4444-8444-444444444441', 99, 't', 'a', 'b', 'r', bad_path
      );
      raise exception '非法 field_path 竟然写进去了：%', bad_path;
    exception
      when check_violation then
        null; -- 预期
    end;
  end loop;
end $$;

\echo '=== 运营后台四张表：anon / authenticated 一行都不该读到 ==='

-- 这一节是运营后台整条信任边界的数据库侧证据。
--
-- 20260726000200_admin_console.sql 给这四张表 enable 了 RLS 却一条策略都没写，
-- 意图是「只有 service_role 能碰」。但「enable 了 RLS」和「读不到」之间隔着
-- 一个容易踩空的前提：Supabase 默认把 public 下所有表 grant 给 anon 和
-- authenticated（见 _harness.sql 复刻的那几条 default privileges）。少写一句
-- enable、或者以后有人顺手补了一条宽松策略，泄漏的就是管理员口令哈希和
-- API key 密文——而这两样都不会有任何报错提醒。所以断言必须落在数据库上。
--
-- 先塞一行进去（此刻还是超级用户身份），否则「读到 0 行」可能只是因为表是空的，
-- 断言等于没断。
do $$
begin
  insert into public.ai_providers (
    label, platform, protocol, model, base_url,
    api_key_cipher, api_key_last4, is_active
  ) values (
    'RLS 断言用', 'deepseek', 'openai_compatible', 'deepseek-chat',
    'https://api.deepseek.com/v1', 'v1.aaaa.bbbb.cccc', '9999', false
  );

  insert into public.admin_audit_log (username, action, detail)
  values ('admin', 'login', '{"probe":true}'::jsonb);

  insert into public.ai_usage (user_id, kind, platform, model, status)
  values ('11111111-1111-4111-8111-111111111111', 'parse', 'anthropic', 'm', 'ok');
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.admin_users;
  if n < 1 then raise exception '前置条件不成立：admin_users 里应有出厂管理员'; end if;
  select count(*) into n from public.ai_providers;
  if n < 1 then raise exception '前置条件不成立：ai_providers 应有探针行'; end if;
end $$;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';

do $$
declare
  n int;
  t text;
begin
  foreach t in array array['admin_users', 'ai_providers', 'ai_usage', 'admin_audit_log'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception '登录用户竟然读到了 %.% 的 % 行（后台数据泄漏）', 'public', t, n;
    end if;
  end loop;
end $$;

-- 写入同样要被挡住。admin_users 尤其关键：能插一行就等于自己发一个管理员账号
do $$
begin
  insert into public.admin_users (username, password_hash)
  values ('impostor', 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  raise exception '登录用户竟然能往 admin_users 插一个管理员';
exception
  when insufficient_privilege then null; -- 预期
end $$;

do $$
begin
  insert into public.ai_providers (label, platform, protocol, model, base_url, api_key_cipher, api_key_last4)
  values ('x', 'deepseek', 'openai_compatible', 'm', 'https://evil.example', 'v1.a.b.c', '0000');
  raise exception '登录用户竟然能写 ai_providers';
exception
  when insufficient_privilege then null; -- 预期
end $$;

do $$
begin
  insert into public.admin_audit_log (username, action) values ('admin', 'login');
  raise exception '登录用户竟然能往审计表里造记录';
exception
  when insufficient_privilege then null; -- 预期
end $$;

-- 唯一的例外：ai_usage 可以插自己的行（前台埋点），但只能是自己的，且插完读不回来
do $$
declare
  n int;
begin
  insert into public.ai_usage (user_id, kind, platform, model, status)
  values ('99999999-9999-4999-8999-999999999999', 'parse', 'anthropic', 'm', 'ok');

  select count(*) into n from public.ai_usage;
  if n <> 0 then
    raise exception '写得进去也就算了，竟然还读得出来 % 行 ai_usage', n;
  end if;
end $$;

do $$
begin
  insert into public.ai_usage (user_id, kind, platform, model, status)
  values ('11111111-1111-4111-8111-111111111111', 'parse', 'anthropic', 'm', 'ok');
  raise exception '竟然能以别人的 user_id 往 ai_usage 写行';
exception
  when insufficient_privilege then null; -- 预期
end $$;

-- 两个 security definer 函数读的是 auth.users。它们的 execute 权限在迁移里被
-- 显式 revoke 掉了——这一条必须断言：_harness.sql 里那句
-- `alter default privileges ... grant execute on functions to anon, authenticated`
-- 会自动把执行权限发给所有人，revoke 漏写一句，任何登录用户都能数出全站用户量
do $$
declare
  n bigint;
begin
  select total into n from public.admin_user_stats();
  raise exception '登录用户竟然能调 admin_user_stats()，拿到 total=%', n;
exception
  when insufficient_privilege then null; -- 预期
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.admin_signup_trend(30);
  raise exception '登录用户竟然能调 admin_signup_trend()';
exception
  when insufficient_privilege then null; -- 预期
end $$;
rollback;

\echo '=== 运营后台四张表：匿名身份同样一行都读不到 ==='

begin;
set local role anon;

do $$
declare
  n int;
  t text;
begin
  foreach t in array array['admin_users', 'ai_providers', 'ai_usage', 'admin_audit_log'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception '匿名身份竟然读到了 %.% 的 % 行', 'public', t, n;
    end if;
  end loop;
end $$;

-- 策略是 `for insert to authenticated`，匿名不该沾边
do $$
begin
  insert into public.ai_usage (user_id, kind, platform, model, status)
  values (null, 'parse', 'anthropic', 'm', 'ok');
  raise exception '匿名身份竟然能往 ai_usage 写行';
exception
  when insufficient_privilege then null; -- 预期
end $$;

do $$
begin
  perform public.admin_user_stats();
  raise exception '匿名身份竟然能调 admin_user_stats()';
exception
  when insufficient_privilege then null; -- 预期
end $$;
rollback;

\echo '=== service_role 仍然读得到（否则后台自己就废了）==='

begin;
set local role service_role;

do $$
declare
  n int;
begin
  select count(*) into n from public.admin_users;
  if n < 1 then raise exception 'service_role 读不到 admin_users，后台无法登录'; end if;

  select count(*) into n from public.ai_providers;
  if n < 1 then raise exception 'service_role 读不到 ai_providers'; end if;

  select count(*) into n from public.admin_signup_trend(7);
  if n <> 7 then raise exception 'admin_signup_trend(7) 应回 7 行，实际 %', n; end if;
end $$;
rollback;

\echo '=== 出厂管理员：存的是哈希，不是明文 ==='

do $$
declare
  h text;
begin
  select password_hash into h from public.admin_users where username = 'admin';
  if h is null then raise exception '找不到出厂管理员 admin'; end if;
  if h not like 'scrypt$16384$8$1$%' then
    raise exception 'admin 的 password_hash 不是预期的 scrypt 串：%', left(h, 20);
  end if;
  if h like '%abc123%' then
    raise exception 'password_hash 里出现了明文口令';
  end if;
end $$;

\echo '=== 同一时刻只能有一条启用的接入 ==='

do $$
begin
  update public.ai_providers set is_active = true;
  insert into public.ai_providers (label, platform, protocol, model, base_url, api_key_cipher, api_key_last4, is_active)
  values ('第二条启用', 'deepseek', 'openai_compatible', 'm', 'https://x.example', 'v1.a.b.c', '0000', true);
  raise exception '竟然能同时启用两条接入';
exception
  when unique_violation then null; -- 预期：ai_providers_single_active
end $$;

\echo ''
\echo '✅ RLS 与数据约束断言全部通过'
