module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 把 worklet 转换拆到了 react-native-worklets。
      // 这个插件必须留在 plugins 数组的最后一位。
      'react-native-worklets/plugin',
    ],
  };
};
