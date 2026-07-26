'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * 登出。
 *
 * 走 POST 而不是一个 <a href>：GET 会被浏览器预取、被别人页面上的 <img>
 * 触发，那样这个按钮就成了别人手里的骚扰开关。
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);

    // 失败也照样跳登录页：cookie 可能已经被服务端清掉了，停在原地更糟
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);

    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#8E8E93',
        background: 'transparent',
        border: '1px solid #E5E5EA',
        borderRadius: 10,
        padding: '6px 12px',
        cursor: busy ? 'progress' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {busy ? '退出中…' : '退出'}
    </button>
  );
}
