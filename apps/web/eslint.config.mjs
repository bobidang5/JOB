// eslint-config-next 16 直接导出 flat config 数组，不需要 FlatCompat 包一层
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // 服务端代码里 console 是唯一的日志出口（错误详情不能进响应体，
      // 见 lib/http.ts），所以不禁。
      'no-console': 'off',
    },
  },
];

export default config;
