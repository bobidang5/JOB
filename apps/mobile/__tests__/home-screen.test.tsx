import { copy } from '@zhiyou/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';
import * as api from '../lib/api';
import { queryKeys } from '../lib/queries';
import { createTestQueryClient, renderWithProviders } from './helpers';

/**
 * DESIGN-SPEC §5.4（首页空状态）与 §5.5（「开始 AI 优化」的三分支）。
 *
 * 空状态与正常态是同一棵树的两个分支，所以两边都要断言「该出现的出现了」
 * 和「该藏起来的藏起来了」——只测前者的话，把 hasResume 写反也能全绿。
 */

/**
 * 首页数据是异步拉的。这里先把快照预热进缓存再挂载 —— 否则首帧
 * data 还是 undefined，两种状态都会先按「空状态」渲染一帧，用例可能
 * 断在那一帧上，测出来的是加载中而不是空状态。
 */
async function renderHome() {
  const queryClient = createTestQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.home,
    queryFn: api.getHomeSnapshot,
  });
  return renderWithProviders(<HomeScreen />, { queryClient });
}

describe('§5.4 首页空状态', () => {
  it('新用户（无简历无记录）：隐藏分数卡与「开始 AI 优化」，显示引导卡', async () => {
    api.resetMockState(true);
    await renderHome();

    expect(screen.getByTestId('home-empty-hero')).toBeTruthy();
    expect(screen.getByText(copy.home.emptyTitle)).toBeTruthy();
    expect(screen.getByText(copy.home.subtitleEmpty)).toBeTruthy();

    expect(screen.queryByTestId('home-score-card')).toBeNull();
    expect(screen.queryByTestId('home-start-optimize')).toBeNull();
    expect(screen.queryByText(copy.home.startOptimize)).toBeNull();
    expect(screen.queryByTestId('home-recent-records')).toBeNull();
  });

  it('引导卡的两个入口分别去模版库与新建简历', async () => {
    api.resetMockState(true);
    await renderHome();

    fireEvent.press(screen.getByTestId('home-empty-from-template'));
    expect(router.push).toHaveBeenCalledWith('/resume/templates');

    fireEvent.press(screen.getByText(copy.home.emptySecondary));
    expect(router.push).toHaveBeenCalledWith('/resume/new');
  });

  it('有数据时切回正常态：分数卡、主按钮、最近记录都在，引导卡消失', async () => {
    api.resetMockState(false);
    await renderHome();

    expect(screen.getByTestId('home-score-card')).toBeTruthy();
    expect(within(screen.getByTestId('home-score-card')).getByText('76')).toBeTruthy();
    expect(screen.getByTestId('home-start-optimize')).toBeTruthy();
    expect(screen.getByText(copy.home.subtitleWithResume)).toBeTruthy();
    expect(screen.getByTestId('home-recent-records')).toBeTruthy();

    expect(screen.queryByTestId('home-empty-hero')).toBeNull();
    expect(screen.queryByText(copy.home.emptyTitle)).toBeNull();
  });
});

describe('§5.5 「开始 AI 优化」的三分支（首页主按钮）', () => {
  it('有简历但没有 JD → 进「粘贴职位描述」', async () => {
    api.resetMockState(false);
    await renderHome();

    fireEvent.press(screen.getByTestId('home-start-optimize'));

    expect(router.push).toHaveBeenCalledWith('/optimize/jd');
    expect(router.push).not.toHaveBeenCalledWith('/optimize/analyzing');
  });

  it('简历与 JD 均有 → 直接进分析页', async () => {
    api.resetMockState(false);
    await api.createJobTarget(
      '【产品经理（增长方向）】负责核心产品线的用户增长策略制定与落地，搭建 A/B 测试体系。',
    );
    await renderHome();

    fireEvent.press(screen.getByTestId('home-start-optimize'));

    expect(router.push).toHaveBeenCalledWith('/optimize/analyzing');
    expect(router.push).not.toHaveBeenCalledWith('/optimize/jd');
  });

  it('JD 只有空白字符时不算「有 JD」，仍然先去粘贴职位描述', async () => {
    api.resetMockState(false);
    await api.createJobTarget('   \n  ');
    await renderHome();

    fireEvent.press(screen.getByTestId('home-start-optimize'));

    expect(router.push).toHaveBeenCalledWith('/optimize/jd');
  });

  it('无简历时首页主按钮根本不渲染，这条分支只能从 Dock 触发', async () => {
    api.resetMockState(true);
    await renderHome();

    expect(screen.queryByTestId('home-start-optimize')).toBeNull();
  });
});
