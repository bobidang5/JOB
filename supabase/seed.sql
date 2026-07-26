-- 本地种子数据（只在 `supabase db reset` 时执行，不会进生产）。
--
-- 目的有二：
--   1. 灌入 4 个简历模版——这是产品的参考数据，生产环境同样需要
--   2. 造出与截图 01/03/04 一致的演示状态，让 App 一起来就能走通全流程

------------------------------------------------------------------
-- 模版（截图 08）
------------------------------------------------------------------

insert into public.resume_templates (key, name, categories, usage_label, is_recommended, sort_order)
values
  ('v1', '简洁单栏',   array['产品'],         '产品经理 · 12k 人在用', true,  1),
  ('v2', '经典双栏',   array['通用'],         '通用 · 8.6k 人在用',    false, 2),
  ('v3', '数据成果型', array['产品', '运营'], '产品 / 运营 · 5.2k 人在用', false, 3),
  ('v4', '应届通用',   array['校招'],         '校招 · 9.1k 人在用',    false, 4)
on conflict (key) do update set
  name = excluded.name,
  categories = excluded.categories,
  usage_label = excluded.usage_label,
  is_recommended = excluded.is_recommended,
  sort_order = excluded.sort_order;

------------------------------------------------------------------
-- 演示账号
--
-- 本地栈跑不了真实的 Google / LinkedIn / Facebook OAuth（需要真实凭据
-- 与公网回调），所以种一个邮箱密码账号供本地调试：
--     demo@zhiyou.ai / demo123456
------------------------------------------------------------------

do $$
declare
  demo_user_id constant uuid := '11111111-1111-4111-8111-111111111111';
  resume_pm    constant uuid := '22222222-2222-4222-8222-222222222221';
  resume_ops   constant uuid := '22222222-2222-4222-8222-222222222222';
  jd_bytedance constant uuid := '33333333-3333-4333-8333-333333333331';
  jd_meituan   constant uuid := '33333333-3333-4333-8333-333333333332';
  analysis_bd  constant uuid := '44444444-4444-4444-8444-444444444441';
  analysis_mt  constant uuid := '44444444-4444-4444-8444-444444444442';
begin
  -- auth.users 的插入会触发 handle_new_user，自动建出 profiles 行
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    demo_user_id, 'authenticated', 'authenticated', 'demo@zhiyou.ai',
    extensions.crypt('demo123456', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"李婷"}'::jsonb
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) values (
    demo_user_id::text, demo_user_id,
    jsonb_build_object('sub', demo_user_id::text, 'email', 'demo@zhiyou.ai'),
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- 补全资料（截图 05）
  update public.profiles set
    full_name = '李婷',
    job_intent = '产品经理',
    years_experience = 3,
    city = '深圳',
    phone = '138****8888',
    email = 'liting@mail.com'
  where id = demo_user_id;

  ----------------------------------------------------------------
  -- 简历
  --
  -- 当前这份存的是「优化前」的内容：自我评价、技能、第一条工作要点和
  -- 项目要点都还是空话版本。这样一进 App 就能用示例 JD 跑完整条主流程，
  -- 四条建议每一条都真的有地方落地，最后 76 → 84。
  ----------------------------------------------------------------
  insert into public.resumes (
    id, user_id, title, template_key, content, score, source, is_default, updated_at
  ) values (
    resume_pm, demo_user_id, '产品经理-李婷.pdf', 'v1',
    jsonb_build_object(
      'name', '李婷',
      'meta', '产品经理 · 3 年经验 · 深圳 · liting@mail.com · 138****8888',
      'summary', '性格开朗，工作认真负责，抗压能力强',
      'exp', jsonb_build_array(
        jsonb_build_object(
          'co', '美团 · 产品运营专员',
          'date', '2023.06 – 至今',
          'lis', jsonb_build_array(
            '负责公司产品的日常运营工作',
            '搭建用户增长 A/B 实验体系，关键转化率提升 12%',
            '沉淀增长打法文档，被 3 个兄弟团队复用'
          )
        ),
        jsonb_build_object(
          'co', '橙心科技 · 产品助理',
          'date', '2022.07 – 2023.05',
          'lis', jsonb_build_array(
            '负责需求文档撰写与竞品分析，推动 8 个版本迭代上线',
            '协助搭建用户反馈闭环，工单响应时长缩短 40%'
          )
        )
      ),
      'projects', jsonb_build_array(
        jsonb_build_object(
          'name', '签到裂变增长项目',
          'date', '2024.03 – 2024.08',
          'lis', jsonb_build_array('参与了用户增长相关项目')
        )
      ),
      'edu', '深圳大学 · 工商管理（本科）',
      'eduDate', '2018 – 2022',
      'skills', '熟悉常用办公软件与数据工具'
    ),
    76, 'upload', true, now()
  )
  on conflict (id) do nothing;

  insert into public.resumes (
    id, user_id, title, template_key, content, score, source, is_default, updated_at
  ) values (
    resume_ops, demo_user_id, '运营专员-李婷.pdf', 'v3',
    jsonb_build_object(
      'name', '李婷',
      'meta', '运营专员 · 3 年经验 · 深圳 · liting@mail.com',
      'summary', '',
      'exp', jsonb_build_array(
        jsonb_build_object(
          'co', '美团 · 产品运营专员',
          'date', '2023.06 – 至今',
          'lis', jsonb_build_array('负责活动运营与用户增长，GMV 提升 18%')
        )
      ),
      'projects', jsonb_build_array(),
      'edu', '深圳大学 · 工商管理（本科）',
      'eduDate', '2018 – 2022',
      'skills', '活动运营 / 数据分析 / 用户增长'
    ),
    71, 'upload', false, now() - interval '6 days'
  )
  on conflict (id) do nothing;

  ----------------------------------------------------------------
  -- 两条历史记录（截图 03）
  --
  -- 「昨天 · 投向字节跳动 76 → 84」与「7月20日 · 投向美团 62 → 71」。
  -- 副标题里的时间由前端按 created_at 相对渲染，公司名取自 job_targets。
  ----------------------------------------------------------------
  insert into public.job_targets (id, user_id, title, company, jd_text, created_at)
  values
    (jd_bytedance, demo_user_id, '产品经理（增长方向）', '字节跳动',
     '【产品经理（增长方向）】岗位职责：负责核心产品线的用户增长策略制定与落地，搭建 A/B 测试体系，'
     '通过数据分析驱动关键转化率提升；与研发、设计协作推进需求文档落地，对 DAU 与留存负责。'
     '任职要求：3 年以上产品经验；熟练使用 SQL 做数据分析；有增长策略实战案例；本科及以上学历。',
     now() - interval '1 day'),
    (jd_meituan, demo_user_id, '运营专员', '美团',
     '【运营专员】岗位职责：负责平台活动策划与执行，跟踪核心指标并输出复盘；配合产品与市场团队推进'
     '用户增长动作，对活动 ROI 负责。任职要求：2 年以上运营经验；熟悉数据分析工具；有完整活动'
     '操盘经验；本科及以上学历。',
     '2026-07-20 10:00:00+08')
  on conflict (id) do nothing;

  insert into public.analyses (
    id, user_id, resume_id, job_target_id, status,
    match_score, satisfied_count, missing_keywords, base_score, max_score,
    created_at, completed_at
  ) values
    (analysis_bd, demo_user_id, resume_pm, jd_bytedance, 'succeeded',
     82, 12,
     '[{"keyword":"SQL","count":4},{"keyword":"A/B 测试","count":3},{"keyword":"增长策略","count":2}]'::jsonb,
     76, 84, now() - interval '1 day', now() - interval '1 day'),
    (analysis_mt, demo_user_id, resume_ops, jd_meituan, 'succeeded',
     74, 9,
     '[{"keyword":"活动复盘","count":3},{"keyword":"ROI","count":2}]'::jsonb,
     62, 71, '2026-07-20 10:02:00+08', '2026-07-20 10:02:00+08')
  on conflict (id) do nothing;

  insert into public.optimizations (
    user_id, analysis_id, resume_id, adopted_count, score_before, score_after, created_at
  ) values
    (demo_user_id, analysis_bd, resume_pm, 4, 76, 84, now() - interval '1 day'),
    (demo_user_id, analysis_mt, resume_ops, 5, 62, 71, '2026-07-20 10:05:00+08')
  on conflict (analysis_id) do nothing;
end $$;
