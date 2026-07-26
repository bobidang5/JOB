import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react-native';
import React from 'react';
import {
  SafeAreaProvider,
  type Metrics,
} from 'react-native-safe-area-context';

import { ToastProvider } from '../components/Toast';
import { OptimizeFlowProvider } from '../lib/optimizeFlow';

/**
 * 屏幕级测试的 provider 外壳。
 *
 * 与 app/_layout.tsx 的区别只有一处：不挂 AuthProvider。登录态由
 * Supabase 会话驱动，被测的这几屏都不读它，挂上反而会在 import 阶段
 * 就去建 Supabase client（没有环境变量时直接抛错），把无关的失败引进来。
 */

/**
 * SafeAreaProvider 默认要等一次原生 onLayout 才渲染 children，测试里
 * 那次回调永远不会来。给一组 iPhone 尺寸的初始 metrics，让它同步渲染。
 */
const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** 每个用例一个干净的 QueryClient，避免用例之间串缓存 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 失败就立刻报错，别让重试把断言拖到超时
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

export function TestProviders({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <OptimizeFlowProvider>{children}</OptimizeFlowProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient },
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? createTestQueryClient();

  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <TestProviders queryClient={queryClient}>{children}</TestProviders>
    ),
  });

  return Object.assign(result, { queryClient });
}

/** renderHook 版本，供直接驱动 useOptimizeFlow / useStartOptimize 的用例使用 */
export function createWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <TestProviders queryClient={queryClient}>{children}</TestProviders>
  );
  return Wrapper;
}

/**
 * 冲掉「点一下按钮之后自己跑起来」的异步链。
 *
 * 比如 JD 页的 beginAnalysis：点击时立刻发请求、几个 microtask 之后
 * setState。用例本身不关心结果，但不冲掉的话这些更新会落在 act() 外，
 * React 会打印告警，实际是在提示测试与组件的生命周期脱了节。
 */
export async function flushAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
