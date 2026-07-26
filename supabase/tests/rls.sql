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

\echo ''
\echo '✅ RLS 与数据约束断言全部通过'
