import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '职优 AI',
  description: 'AI 帮你把简历改得更贴合目标职位',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: '#F7F7FA',
          color: '#111114',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
