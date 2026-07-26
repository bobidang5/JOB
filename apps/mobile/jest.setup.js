/**
 * 测试环境的原生模块替身。
 *
 * jest-expo 只提供 Expo 运行时的基础桩，凡是带原生实现的模块（相机、
 * 打印、Keychain、玻璃模糊、SVG、WebView…）在 Node 里 require 会直接
 * 崩，所以这里统一换成纯 JS 的最小实现。原则是「保住形状、不保住行为」：
 * 组件降级成普通 View，异步 API 返回一个合理的成功值，让被测的业务逻辑
 * 能一路跑到断言点，而不是在渲染阶段就炸掉。
 */

/** 把一组名字做成透传 children 的 View 组件（用于 SVG / WebView 这类） */
function mockViewComponents(names) {
  const React = require('react');
  const { View } = require('react-native');
  const components = {};
  for (const name of names) {
    const Component = ({ children, ...props }) =>
      React.createElement(View, props, children);
    Component.displayName = name;
    components[name] = Component;
  }
  return components;
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

/**
 * expo-router 的断言桩。
 *
 * 真实的 router 依赖一整棵导航树，测试里跑不起来也不该跑——DESIGN-SPEC
 * §5.1/§5.4 关心的是「点了之后去哪个路由」，所以这里把 push/replace/
 * dismissAll 换成 jest.fn()，用例直接断言目标路径。
 *
 * Tabs 只渲染 tabBar：Dock 上的 AI 圆钮与首页主按钮共用同一份分支逻辑，
 * 这样 app/(tabs)/_layout.tsx 的接线本身也能被覆盖到。
 */
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
    reload: jest.fn(),
    prefetch: jest.fn(),
  };

  const tabsNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
  };

  const Screen = () => null;

  const Stack = ({ children }) => React.createElement(View, null, children);
  Stack.Screen = Screen;

  const Tabs = ({ tabBar }) =>
    React.createElement(
      View,
      null,
      tabBar
        ? tabBar({
            state: { index: 0, routes: [{ key: 'index', name: 'index' }] },
            navigation: tabsNavigation,
            descriptors: {},
          })
        : null,
    );
  Tabs.Screen = Screen;

  const Link = ({ children }) => React.createElement(View, null, children);

  return {
    __esModule: true,
    router,
    useRouter: () => router,
    useNavigation: () => tabsNavigation,
    useSegments: () => [],
    usePathname: () => '/',
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useFocusEffect: () => undefined,
    Stack,
    Tabs,
    Link,
    Redirect: () => null,
    SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
  };
});

/* ------------------------------------------------------------------ */
/* 视觉类原生模块                                                      */
/* ------------------------------------------------------------------ */

// Dock 的 Liquid Glass 材质，测试里退化成普通 View
jest.mock('expo-blur', () => mockViewComponents(['BlurView']));

jest.mock('react-native-svg', () => {
  const components = mockViewComponents([
    'Svg',
    'Circle',
    'Ellipse',
    'G',
    'Path',
    'Rect',
    'Line',
    'Polygon',
    'Polyline',
    'Text',
    'TSpan',
    'Defs',
    'ClipPath',
    'Stop',
    'LinearGradient',
    'RadialGradient',
    'Mask',
    'Use',
  ]);
  return { __esModule: true, ...components, default: components.Svg };
});

jest.mock('react-native-webview', () => mockViewComponents(['WebView']));

// Reanimated 自带一份官方 mock，比手写的更贴近真实 API 面
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

/* ------------------------------------------------------------------ */
/* 设备能力类原生模块                                                  */
/* ------------------------------------------------------------------ */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  isAvailableAsync: jest.fn(async () => true),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///mock/resume.pdf' })),
  printAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({
    granted: true,
    status: 'granted',
  })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })),
  maybeCompleteAuthSession: jest.fn(),
  dismissAuthSession: jest.fn(),
}));

// 只 mock 模块本身，登录流程的实现按约定保持原样、不在此次测试范围内
jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    isAvailableAsync: jest.fn(async () => false),
    signInAsync: jest.fn(async () => ({ identityToken: null })),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
    AppleAuthenticationButton: (props) => React.createElement(View, props),
  };
});
