-- Supabase 兼容桩 —— 只用于在没有 Docker 的环境里跑 RLS 断言。
--
-- 生产与本地 `supabase start` 用的是真正的 Supabase 栈，这个文件不参与。
-- 它复刻的是 RLS 真正依赖的那几样东西：anon / authenticated 角色、
-- auth.uid() 的取值方式、auth.users 与 storage.objects 的结构、
-- storage.foldername()。策略本身、约束、触发器跑的都是真的 Postgres。
--
-- 桩不覆盖的部分：GoTrue 的登录流程、PostgREST 的请求编码、Storage API
-- 的对象读写。那些要在真的 Supabase 栈上验（见 README 的 `pnpm db:test`）。

------------------------------------------------------------------
-- 角色
------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

------------------------------------------------------------------
-- schema 与扩展
------------------------------------------------------------------

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;

------------------------------------------------------------------
-- auth
------------------------------------------------------------------

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

create table if not exists auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (provider, provider_id)
);

-- 与 Supabase 的实现一致：先读 request.jwt.claim.sub，再回落到
-- request.jwt.claims 里的 sub。测试用 `set local request.jwt.claims` 注入。
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

------------------------------------------------------------------
-- storage
------------------------------------------------------------------

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

-- 与 Supabase 的实现一致：返回路径里除最后一段之外的所有目录段，
-- 所以 (storage.foldername(name))[1] 就是首层目录。
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

------------------------------------------------------------------
-- 让迁移之后创建的表自动带上 Supabase 的默认授权
------------------------------------------------------------------

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
