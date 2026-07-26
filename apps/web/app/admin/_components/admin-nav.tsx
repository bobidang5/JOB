'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 顶栏导航。
 *
 * 唯一需要客户端的理由就是 usePathname——得知道当前在哪一页才能把那一项
 * 标出来。没有高亮的话，四个链接长得一模一样，切过去之后除了内容变了没有
 * 任何反馈，很容易反复点同一项。
 */

const ITEMS = [
  { href: '/admin', label: '看板' },
  // AI 接入配置页（ai_providers 那套）。实际落在 /admin/settings，
  // /admin/providers 是接口的地址，不是页面的
  { href: '/admin/settings', label: 'AI 接入' },
  { href: '/admin/password', label: '修改口令' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              color: active ? '#007AFF' : '#3A3A3C',
              background: active ? '#EAF3FF' : 'transparent',
              borderRadius: 10,
              padding: '6px 12px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 「看板」的地址是 /admin，它是所有后台路径的前缀，用 startsWith 判断会让
 * 它在每一页都亮着。所以根路径只认精确相等，其余的才按前缀（将来
 * /admin/providers/new 这种子页面也该把父项点亮）。
 */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
