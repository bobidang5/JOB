import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import type { AdminProviderView } from '../../../lib/admin/provider-view';
import { listProviders } from '../../../lib/admin/providers';
import { readAdminSession } from '../../../lib/admin/session';
import { AdminShell } from '../_components/admin-shell';
import { CARD, ERROR_BOX, HINT } from '../_components/styles';
import { ProviderSettings } from './settings-client';

export const metadata: Metadata = {
  title: 'AI 接入 · 职优 AI 运营后台',
};

/**
 * AI 接入配置页。
 *
 * Server Component 只负责两件事：校验会话、取一份初始数据。之后的增删改和
 * 连通性测试都在客户端组件里走 /api/admin/providers，服务端不重复一套逻辑。
 *
 * 数据走 lib/admin/providers.ts 的 listProviders()，页面自己不碰
 * service_role 客户端——那把 key 的活动范围钉死在 lib/admin/ 与
 * app/api/admin/ 之下（理由见 lib/admin/db.ts）。
 *
 * 那个函数只取公开列。这不是为了省字节：Server Component 传给客户端组件的
 * props 会被序列化进 HTML 一起发下去，密文放进 props 和直接印在页面上没有
 * 区别。
 */
export default async function AdminSettingsPage() {
  const session = await readAdminSession();
  if (!session) redirect('/admin/login');

  let providers: AdminProviderView[] = [];
  let loadError: string | null = null;

  try {
    providers = await listProviders();
  } catch (error) {
    /*
     * 读不到就把原因显示出来，而不是让整页 500。
     *
     * 最常见的成因是没配 SUPABASE_SERVICE_ROLE_KEY，adminDb() 为此专门抛了一句
     * 讲清楚缺什么的话（见 lib/admin/db.ts）。这个页面只有登录过的管理员看得到，
     * 而且那句话里只有环境变量的名字、没有值，原样显示比一个白屏有用得多。
     */
    loadError = error instanceof Error ? error.message : '读取接入配置失败';
    console.error('[admin] 读取 ai_providers 失败', error);
  }

  return (
    <AdminShell title="AI 接入配置">
      {loadError ? (
        <div style={CARD}>
          <p role="alert" style={{ ...ERROR_BOX, margin: 0, whiteSpace: 'pre-wrap' }}>
            {loadError}
          </p>
        </div>
      ) : (
        <ProviderSettings initialProviders={providers} />
      )}

      <p style={{ ...HINT, marginTop: 16 }}>
        同一时刻只有一条接入处于启用状态，前台的简历解析与分析都走它。改完配置
        最多半分钟生效（前台有 30 秒缓存）。没有任何启用项时会退回 AI_PROVIDER
        环境变量，通常是 mock 数据。
      </p>
    </AdminShell>
  );
}
