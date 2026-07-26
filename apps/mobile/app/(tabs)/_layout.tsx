import { Tabs } from 'expo-router';
import React from 'react';

import { GlassDock, type DockTabKey } from '../../components/GlassDock';
import { useStartOptimize } from '../../lib/useStartOptimize';

/** 路由名 ↔ Dock 上的 Tab */
const ROUTE_TO_TAB: Record<string, DockTabKey> = {
  index: 'home',
  records: 'records',
  me: 'me',
};

const TAB_TO_ROUTE: Record<DockTabKey, string> = {
  home: 'index',
  records: 'records',
  me: 'me',
};

export default function TabsLayout() {
  const startOptimize = useStartOptimize();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Dock 是绝对定位的 overlay，内容要能从它下面穿过去，
        // 所以这里不能让 react-navigation 给场景加底部内边距。
        tabBarStyle: { position: 'absolute', borderTopWidth: 0 },
        // 一级页之间互相平级切换，用淡入而不是左右推（DESIGN-SPEC §2）
        animation: 'fade',
      }}
      tabBar={({ state, navigation }) => {
        const routeName = state.routes[state.index]?.name ?? 'index';
        const active = ROUTE_TO_TAB[routeName] ?? 'home';

        return (
          <GlassDock
            active={active}
            onSelectTab={(key) => {
              const target = TAB_TO_ROUTE[key];
              if (target !== routeName) navigation.navigate(target);
            }}
            onPressAi={startOptimize}
          />
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: '首页' }} />
      <Tabs.Screen name="records" options={{ title: '记录' }} />
      <Tabs.Screen name="me" options={{ title: '我的' }} />
    </Tabs>
  );
}
