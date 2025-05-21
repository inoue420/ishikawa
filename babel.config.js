// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    // 他のプラグインがあればここに追記
    'react-native-reanimated/plugin',  // ← 必ず最後に
  ],
};
