const expoConfig = require('eslint-config-expo/flat');

/**
 * Jest 注入的全局量。eslint-config-expo 描述的是 App bundle 的环境
 * （浏览器 + React Native），不含这些，测试文件里用到会被判成 no-undef。
 */
const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
};

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    // 测试与 Jest 配置跑在 Node 里，不进 App bundle
    files: [
      '__tests__/**/*.{ts,tsx}',
      'jest.config.js',
      'jest.setup.js',
      'jest.resolver.js',
    ],
    languageOptions: {
      globals: {
        ...jestGlobals,
        __dirname: 'readonly',
      },
    },
  },
];
