/**
 * Jest 配置（DESIGN-SPEC §5 的业务规则测试）。
 *
 * 三个 monorepo 相关的坑，配置里逐个绕开：
 *
 * 1. transformIgnorePatterns —— Expo / RN 生态的包在 npm 上是未编译的
 *    ESM+JSX 源码，默认「node_modules 一律不转译」会让它们在 require
 *    时直接语法报错。jest-expo 的预设已经放行了 expo* / @expo/* /
 *    react-native* / @react-native*（前缀匹配，所以 expo-blur、
 *    react-native-svg 这类都在内），这里只需要补上 workspace 包
 *    @zhiyou/shared —— 它的 main 指向 src/index.ts，是源码而非产物。
 *
 * 2. 符号链接 —— pnpm 的 hoisted 布局把 @zhiyou/shared 做成指向
 *    packages/shared 的软链。Jest 解析后会 realpath，路径里不再含
 *    node_modules，本来就会被转译；补进白名单只是为了万一将来
 *    node-linker 变了也不至于突然全红。
 *
 * 3. `./schemas.js` 这种 NodeNext 风格的相对导入 —— 见 jest.resolver.js。
 *
 * testMatch 收紧到 *.test.ts(x)，否则 __tests__/helpers.tsx 会被当成
 * 一个「没有用例」的测试文件而报错。
 */
module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,

  resolver: '<rootDir>/jest.resolver.js',

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],

  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|@zhiyou|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
    // 与 jest-expo 预设保持一致：这两处一旦被转译会触发 babel 插件重入
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],

  // 每个用例前清掉调用记录（保留实现），这样 router.push 之类的断言桩
  // 不需要在每个 describe 里手写 mockClear。
  clearMocks: true,
};
