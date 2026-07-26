import { copy } from '@zhiyou/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import TabsLayout from '../app/(tabs)/_layout';
import * as api from '../lib/api';
import { queryKeys } from '../lib/queries';
import { createTestQueryClient, renderWithProviders } from './helpers';

/**
 * DESIGN-SPEC §5.5：Dock 上的 AI 圆钮与首页主按钮共用同一份分支逻辑。
 *
 * 这里渲染的是 app/(tabs)/_layout.tsx 本身（expo-router 的 Tabs 桩只
 * 渲染 tabBar），所以断言覆盖的是真实接线 onPressAi={useStartOptimize()}，
 * 而不是在测试里重搭一遍。无简历那条分支只有 Dock 能触发——首页主按钮
 * 在空状态下压根不渲染。
 */

const LONG_JD =
  '【产品经理（增长方向）】负责核心产品线的用户增长策略制定与落地，搭建 A/B 测试体系，' +
  '通过数据分析驱动关键转化率提升。任职要求：3 年以上产品经验，熟练使用 SQL。';

async function renderDock() {
  const queryClient = createTestQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.home,
    queryFn: api.getHomeSnapshot,
  });
  return renderWithProviders(<TabsLayout />, { queryClient });
}

describe('§5.5 Dock 的 AI 圆钮：三分支', () => {
  it('无简历 → Toast「先创建一份简历吧」并跳新建简历', async () => {
    api.resetMockState(true);
    await renderDock();

    fireEvent.press(screen.getByTestId('dock-ai-button'));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      copy.home.needResumeFirst,
    );
    expect(router.push).toHaveBeenCalledWith('/resume/new');
    expect(router.push).not.toHaveBeenCalledWith('/optimize/jd');
    expect(router.push).not.toHaveBeenCalledWith('/optimize/analyzing');
  });

  it('有简历无 JD → 进 JD 页，且不弹 Toast', async () => {
    api.resetMockState(false);
    await renderDock();

    fireEvent.press(screen.getByTestId('dock-ai-button'));

    expect(router.push).toHaveBeenCalledWith('/optimize/jd');
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('简历与 JD 均有 → 直接进分析页', async () => {
    api.resetMockState(false);
    await api.createJobTarget(LONG_JD);
    await renderDock();

    fireEvent.press(screen.getByTestId('dock-ai-button'));

    expect(router.push).toHaveBeenCalledWith('/optimize/analyzing');
    expect(router.push).not.toHaveBeenCalledWith('/optimize/jd');
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('AI 圆钮不是 Tab —— 它不参与选中态，也不切页', async () => {
    api.resetMockState(false);
    await renderDock();

    const aiButton = screen.getByTestId('dock-ai-button');
    expect(aiButton.props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('dock-tab-home').props.accessibilityRole).toBe('tab');
  });
});
