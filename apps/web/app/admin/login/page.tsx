import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readAdminSession } from '../../../lib/admin/session';
import { CARD, HINT } from '../_components/styles';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: '登录 · 职优 AI 运营后台',
};

/**
 * 后台登录页。
 *
 * middleware 放行了这个地址，否则未登录的人会被一路重定向到登录页、
 * 而登录页自己又被挡住，转成死循环。
 *
 * 已登录直接送去 /admin。这里用的是 readAdminSession()（会回查
 * token_version），所以一张改密后作废的旧票据不会把人卡在登录页上——
 * 它会被判成未登录，正常显示表单。
 */
export default async function AdminLoginPage() {
  if (await readAdminSession()) redirect('/admin');

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: -0.3,
            margin: '0 0 6px',
            textAlign: 'center',
          }}
        >
          职优 AI 运营后台
        </h1>
        <p style={{ ...HINT, margin: '0 0 24px', textAlign: 'center' }}>
          仅供内部使用
        </p>

        <div style={CARD}>
          <LoginForm />
        </div>

        <p style={{ ...HINT, marginTop: 20, textAlign: 'center' }}>
          还在用出厂口令的话，登录后请立刻修改。
        </p>
      </div>
    </main>
  );
}
