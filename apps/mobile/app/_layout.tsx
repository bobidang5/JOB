import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '../components/Toast';
import { AuthProvider, useAuth } from '../lib/auth';
import { OptimizeFlowProvider } from '../lib/optimizeFlow';
import { isSupabaseConfigured } from '../lib/supabase';
import { colors } from '../theme';

/**
 * 路由守卫：没登录就送去登录页，登录了就别停在登录页。
 *
 * 没配 Supabase 环境变量时直接放行 —— 这样刚 clone 下来的人不用先建
 * Supabase 项目也能 `pnpm mobile` 扫码把 16 个界面走一遍（数据走
 * lib/api.ts 的 mock）。配好之后守卫自动生效。
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !isSupabaseConfigured) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isLoading, router, segments, session]);

  if (isLoading && isSupabaseConfigured) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 这是一个单人使用的工具，数据只会被自己改动，
            // 不需要窗口聚焦就重新拉取。
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <OptimizeFlowProvider>
                <StatusBar style="dark" />
                <AuthGate>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg.screen },
                      // 流程页走 iOS 标准的右侧推入 / 返回右滑出（§2）
                      animation: 'slide_from_right',
                      gestureEnabled: true,
                    }}
                  >
                    <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
                    <Stack.Screen
                      name="(auth)/sign-in"
                      options={{ animation: 'fade', gestureEnabled: false }}
                    />
                    {/* 分析页不可返回（§5.2）：关掉侧滑手势，返回键单独处理 */}
                    <Stack.Screen
                      name="optimize/analyzing"
                      options={{ gestureEnabled: false }}
                    />
                    {/* 完成页同理，只能走右上角的「完成」清栈回首页 */}
                    <Stack.Screen
                      name="optimize/done"
                      options={{ gestureEnabled: false }}
                    />
                  </Stack>
                </AuthGate>
              </OptimizeFlowProvider>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.screen,
  },
});
