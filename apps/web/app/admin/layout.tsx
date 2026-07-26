import Link from 'next/link';
import type { ReactNode } from 'react';

import { readAdminSession } from '../../lib/admin/session';
import { AdminNav } from './_components/admin-nav';
import { LogoutButton } from './_components/logout-button';

/**
 * 后台外壳：出厂口令警告条 + 顶栏导航 + 内容区。
 *
 * 放在 layout 而不是每页各自套一个组件，有两个实际好处：切页时顶栏不重挂
 * （导航不会闪一下），以及警告条只有一处能改——它必须每页都在，而「每页都
 * 记得写上」这种约定迟早会漏。
 *
 * ── 为什么这里可以没有会话 ────────────────────────────────────────
 * /admin/login 也在这个 layout 底下。layout 无法跳过某个子路由，所以没有
 * 会话时它就不套外壳，把 children 原样交出去——登录页自带完整版式。
 * **这不是鉴权**：这一层只决定画不画外壳。真正拦人的是 middleware（轻校验）
 * 加每个页面自己调的 readAdminSession()（回查 token_version 的权威校验）。
 * 每页仍然要自己校验一次，绝不能因为「layout 已经读过会话了」就省掉。
 *
 * 代价是每次打开后台页面会多查一次 admin_users（layout 一次、页面一次）。
 * 都是主键查询，对一个内部后台来说，比把鉴权散进 layout 里划算得多。
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await readAdminSession();

  if (!session) return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh' }}>
      {session.isDefaultPassword ? <DefaultPasswordBanner /> : null}

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '12px 20px',
          background: '#FFFFFF',
          borderBottom: '1px solid #ECECF0',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link
            href="/admin"
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: '#111114',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            职优 AI 运营后台
          </Link>
          <AdminNav />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#8E8E93' }}>{session.username}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 64px' }}>
        {children}
      </main>
    </div>
  );
}

/**
 * 出厂口令警告条。
 *
 * **没有关闭按钮，是故意的。** 出厂口令 admin/abc123 明写在迁移文件里，
 * 任何拿到源码的人都知道它——只要 admin_users.is_default_password 还是
 * true，这个后台就等于没上锁。所以这条一直碍眼，直到口令被改掉为止；
 * 能关掉的提示只会被关掉一次，然后再也想不起来。
 *
 * 口令本身写出来了：真正的秘密早就不是秘密（它在公开的迁移文件里），
 * 把话说全才能让人立刻明白严重性，而不是以为「有个默认口令要改改」。
 */
function DefaultPasswordBanner() {
  return (
    <div
      style={{
        background: '#FFF4E5',
        borderBottom: '1px solid #FFD8A8',
        color: '#8A5300',
        fontSize: 13,
        lineHeight: 1.7,
        padding: '10px 20px',
        textAlign: 'center',
      }}
    >
      <strong style={{ fontWeight: 800 }}>安全警告：</strong>
      仍在使用出厂口令 admin / abc123，它公开写在仓库的迁移文件里。公网部署前请先
      <Link href="/admin/password" style={{ color: '#8A5300', fontWeight: 800, marginLeft: 4 }}>
        修改口令
      </Link>
      。
    </div>
  );
}
