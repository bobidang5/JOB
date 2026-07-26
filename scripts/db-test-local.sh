#!/usr/bin/env bash
# 在一个临时的本地 Postgres 实例上跑迁移 + 种子 + RLS 断言。
#
# 为什么需要它：CI / 容器环境里未必有 Docker（本项目的开发容器就拉不到
# Supabase 的镜像），但 RLS 策略是安全关键，不能只靠肉眼看。这个脚本用
# supabase/tests/_harness.sql 复刻 auth.uid()、角色和 storage 结构，把真
# 正的迁移与断言跑在真正的 Postgres 上。
#
# 它验证的是：建表、约束、触发器、RLS 策略、种子数据。
# 它不验证的是：GoTrue 登录、PostgREST、Storage API —— 那些要在真的
# Supabase 栈上跑 `pnpm db:test`。

set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
PGDATA="$WORKDIR/pgdata"
SOCKET="$WORKDIR/socket"
DBNAME="zhiyou_test"

# Postgres 拒绝以 root 身份运行。用 root 调用时降权到 postgres 账号；
# 其它情况直接用当前用户。
RUNAS_USER=""
if [ "$(id -u)" -eq 0 ]; then
  RUNAS_USER="${PG_RUNAS:-postgres}"
  if ! id "$RUNAS_USER" >/dev/null 2>&1; then
    echo "以 root 运行但找不到降权用户 '$RUNAS_USER'。" >&2
    echo "设置 PG_RUNAS=<某个非 root 用户>，或换非 root 身份执行本脚本。" >&2
    exit 1
  fi
fi

as_pg() {
  if [ -n "$RUNAS_USER" ]; then
    su "$RUNAS_USER" -s /bin/bash -c "$1"
  else
    bash -c "$1"
  fi
}

cleanup() {
  if [ -d "$PGDATA" ]; then
    as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -m immediate stop" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

if [ ! -x "$PGBIN/initdb" ]; then
  echo "找不到 Postgres 服务端二进制（$PGBIN）。" >&2
  echo "装一个本地 Postgres，或用 'pnpm db:test' 走真正的 Supabase 栈。" >&2
  exit 1
fi

mkdir -p "$SOCKET"
if [ -n "$RUNAS_USER" ]; then
  chown -R "$RUNAS_USER" "$WORKDIR"
fi

echo "→ 初始化临时实例…"
as_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust --no-sync" >/dev/null

echo "→ 启动…"
as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' \
  -o \"-k '$SOCKET' -c listen_addresses='' -c fsync=off\" \
  -l '$WORKDIR/postgres.log' -w start" >/dev/null

export PGHOST="$SOCKET"
export PGUSER=postgres

as_pg "PGHOST='$SOCKET' PGUSER=postgres '$PGBIN/createdb' '$DBNAME'"

run() {
  as_pg "PGHOST='$SOCKET' PGUSER=postgres psql -d '$DBNAME' -v ON_ERROR_STOP=1 -q -f '$1'"
}

echo "→ Supabase 兼容桩…"
run "$ROOT/supabase/tests/_harness.sql"

echo "→ 迁移…"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$migration")"
  run "$migration"
done

echo "→ 种子数据…"
run "$ROOT/supabase/seed.sql"

echo "→ RLS 断言…"
as_pg "PGHOST='$SOCKET' PGUSER=postgres psql -d '$DBNAME' -v ON_ERROR_STOP=1 \
  -f '$ROOT/supabase/tests/rls.sql'"
