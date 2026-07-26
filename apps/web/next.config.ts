import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @zhiyou/shared 以 TypeScript 源码形式被引用（见它的 package.json exports），
  // 所以要让 Next 一起编译，而不是当成已编译的依赖。
  transpilePackages: ['@zhiyou/shared'],
  experimental: {
    // monorepo 里让 Next 正确推断项目根，避免把 workspace 根当成 outputFileTracing 根
    externalDir: true,
  },
};

export default nextConfig;
