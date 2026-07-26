import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readAdminSession } from '../../../lib/admin/session';
import { AdminShell } from '../_components/admin-shell';
import { CARD, HINT } from '../_components/styles';
import { PasswordForm } from './password-form';

export const metadata: Metadata = {
  title: '修改口令 · 职优 AI 运营后台',
};

/**
 * 改密页。
 *
 * middleware 已经拦过一道，这里仍然自己调 readAdminSession()：那一层跑在
 * Edge runtime 上、查不了 token_version，一张改密后作废的票据它是放行的。
 * 权威判断只在这一层。
 */
export default async function AdminPasswordPage() {
  const session = await readAdminSession();
  if (!session) redirect('/admin/login');

  return (
    <AdminShell session={session} title="修改口令">
      {/* 外壳的内容区按看板的宽度来（1040），一个表单铺满那么宽会难读 */}
      <div style={{ maxWidth: 460 }}>
        <div style={CARD}>
          <PasswordForm />
        </div>
        <p style={{ ...HINT, marginTop: 16 }}>
          修改成功后，除当前这台设备外的所有后台会话会立即失效。
        </p>
      </div>
    </AdminShell>
  );
}
