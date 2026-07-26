import type { ReactNode } from 'react';

import type { AdminSession } from '../../../lib/admin/session';

/**
 * 页面标题 + 内容区。
 *
 * 顶栏、导航和出厂口令警告条已经上移到 app/admin/layout.tsx——那三样每页
 * 都一样，放在 layout 里切页时不会重挂，也不用指望「每个新页面都记得套一层
 * 外壳」这种约定（警告条尤其不能漏，它是这个后台能不能上公网的提醒）。
 * 这里只剩下每页各不相同的那部分。
 *
 * session 保留在签名里但不参与渲染：外壳不再需要它了，留着是为了已有调用点
 * 不必跟着改。页面本来就要自己调 readAdminSession() 做权威校验，顺手把结果
 * 传进来无害。新页面只传 title 即可。
 */
export function AdminShell({
  title,
  children,
}: {
  session?: AdminSession;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2, margin: '0 0 20px' }}>
        {title}
      </h1>
      {children}
    </>
  );
}
