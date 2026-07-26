/**
 * 模块解析器：在 React Native 官方解析器之上补一条回退规则。
 *
 * packages/shared 是 ESM 源码包（"type": "module"），内部相对导入按
 * TypeScript 的 NodeNext 规范写成 `./schemas.js`，而磁盘上只有
 * `schemas.ts`。Metro 与 vitest 都会自动回退到 .ts，Jest 的默认解析器
 * 不会——它按字面找 .js，然后抛 MODULE_NOT_FOUND。
 *
 * 用解析器回退而不是 moduleNameMapper（`^(\.{1,2}/.*)\.js$` → `$1`），
 * 是因为 moduleNameMapper 对 node_modules 里所有相对导入一视同仁地生效，
 * 会把第三方包里真实存在的 `./x.js` 也改写掉；这里只在「按字面找不到」
 * 时才尝试同名 .ts/.tsx，正常包的解析路径完全不受影响。
 */
const reactNativeResolver = require('@react-native/jest-preset/jest/resolver');

const RELATIVE_JS = /^(\.{1,2}\/.*)\.js$/;

module.exports = function resolve(request, options) {
  try {
    return reactNativeResolver(request, options);
  } catch (error) {
    const match = RELATIVE_JS.exec(request);
    if (!match) throw error;

    for (const extension of ['.ts', '.tsx']) {
      try {
        return reactNativeResolver(match[1] + extension, options);
      } catch {
        // 试下一个后缀
      }
    }
    throw error;
  }
};
