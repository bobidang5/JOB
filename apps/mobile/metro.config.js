// Metro 的 monorepo 配置：让它能解析 workspace 里的 @zhiyou/shared 源码。
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 监听整个 workspace，改动 packages/shared 时能热更新
config.watchFolders = [workspaceRoot];

// 两处 node_modules 都要找（根 npmrc 已设 node-linker=hoisted）
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
