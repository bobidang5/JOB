import { MIN_JD_LENGTH, MOCK_JD_TEXT, copy } from '@zhiyou/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Animated, StyleSheet } from 'react-native';

import JdScreen from '../app/optimize/jd';
import * as api from '../lib/api';
import { queryKeys } from '../lib/queries';
import { colors } from '../theme';
import { createTestQueryClient, flushAsync, renderWithProviders } from './helpers';

/**
 * DESIGN-SPEC §5.1（JD 校验）。
 *
 * 覆盖三件事：字数实时更新、不足 MIN_JD_LENGTH 时的错误态三要素
 * （红描边 + 抖动 + 错误文案）、以及达标后错误消失并放行到分析页。
 * 长度一律按 trim() 之后算。
 */

/** 造一段指定「有效字数」的 JD */
const jd = (length: number) => '增'.repeat(length);

/** 输入框外层那张卡（红描边画在它身上） */
function inputCardStyle() {
  return StyleSheet.flatten(screen.getByTestId('jd-input-card').props.style);
}

async function renderJdScreen() {
  const queryClient = createTestQueryClient();
  // 先把首页快照灌进缓存：analyze 分支要读 defaultResume，
  // 不预热的话会撞上「数据还没到 → 当成无简历」的竞态，测不到本规则。
  await queryClient.prefetchQuery({
    queryKey: queryKeys.home,
    queryFn: api.getHomeSnapshot,
  });
  return renderWithProviders(<JdScreen />, { queryClient });
}

beforeEach(() => {
  api.resetMockState(false);
});

describe('§5.1 JD 校验', () => {
  it('MIN_JD_LENGTH 取自 packages/shared，是 50', () => {
    expect(MIN_JD_LENGTH).toBe(50);
  });

  it('字数随输入实时更新，且按 trim() 之后算', async () => {
    await renderJdScreen();

    expect(screen.getByTestId('jd-count')).toHaveTextContent(copy.jd.charCount(0));

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(12));
    expect(screen.getByTestId('jd-count')).toHaveTextContent(copy.jd.charCount(12));

    fireEvent.changeText(screen.getByTestId('jd-input'), `   ${jd(12)}\n\n  `);
    expect(screen.getByTestId('jd-count')).toHaveTextContent(copy.jd.charCount(12));

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH));
    expect(screen.getByTestId('jd-count')).toHaveTextContent(
      copy.jd.charCount(MIN_JD_LENGTH),
    );
  });

  it('初始没有错误文案，输入框也没有红描边', async () => {
    await renderJdScreen();

    expect(screen.getByTestId('jd-error')).toHaveTextContent('');
    expect(inputCardStyle().borderColor).not.toBe(colors.error);
  });

  it('不足 50 字点「开始分析」→ 红描边 + 抖动 + 错误文案，且不跳转', async () => {
    const shake = jest.spyOn(Animated, 'sequence');
    await renderJdScreen();

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH - 1));
    fireEvent.press(screen.getByTestId('jd-analyze'));

    expect(screen.getByTestId('jd-error')).toHaveTextContent(copy.jd.tooShort);
    expect(inputCardStyle().borderColor).toBe(colors.error);
    expect(shake).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('只有空白字符也算不达标——按 trim() 后的长度判断', async () => {
    await renderJdScreen();

    // 原始长度远超 50，trim 之后只剩 10
    fireEvent.changeText(
      screen.getByTestId('jd-input'),
      `${' '.repeat(60)}${jd(10)}${' '.repeat(60)}`,
    );
    fireEvent.press(screen.getByTestId('jd-analyze'));

    expect(screen.getByTestId('jd-count')).toHaveTextContent(copy.jd.charCount(10));
    expect(screen.getByTestId('jd-error')).toHaveTextContent(copy.jd.tooShort);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('补足到 50 字后错误态立即消失（不必再点一次按钮）', async () => {
    await renderJdScreen();

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(10));
    fireEvent.press(screen.getByTestId('jd-analyze'));
    expect(screen.getByTestId('jd-error')).toHaveTextContent(copy.jd.tooShort);

    // 差一个字仍是错误态
    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH - 1));
    expect(screen.getByTestId('jd-error')).toHaveTextContent(copy.jd.tooShort);
    expect(inputCardStyle().borderColor).toBe(colors.error);

    // 刚好达标，红描边与文案同时消失
    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH));
    expect(screen.getByTestId('jd-error')).toHaveTextContent('');
    expect(inputCardStyle().borderColor).not.toBe(colors.error);
  });

  it('达标后点「开始分析」进入分析页', async () => {
    await renderJdScreen();

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH));
    fireEvent.press(screen.getByTestId('jd-analyze'));

    expect(screen.getByTestId('jd-error')).toHaveTextContent('');
    expect(router.push).toHaveBeenCalledWith('/optimize/analyzing');

    // beginAnalysis 是即刻发起的异步请求，等它落定再结束用例
    await flushAsync();
  });

  it('「粘贴示例 JD」一次性填满，直接达到达标状态', async () => {
    await renderJdScreen();

    fireEvent.press(screen.getByTestId('jd-paste-demo'));

    expect(screen.getByTestId('jd-count')).toHaveTextContent(
      copy.jd.charCount(MOCK_JD_TEXT.trim().length),
    );
    expect(MOCK_JD_TEXT.trim().length).toBeGreaterThanOrEqual(MIN_JD_LENGTH);
    expect(await screen.findByTestId('toast')).toHaveTextContent(copy.jd.pastedDemo);

    fireEvent.press(screen.getByTestId('jd-analyze'));
    expect(screen.getByTestId('jd-error')).toHaveTextContent('');
    expect(router.push).toHaveBeenCalledWith('/optimize/analyzing');

    await flushAsync();
  });

  it('没有简历时即使 JD 达标也先去新建简历（§5.5 的同一条兜底）', async () => {
    api.resetMockState(true);
    await renderJdScreen();

    fireEvent.changeText(screen.getByTestId('jd-input'), jd(MIN_JD_LENGTH));
    fireEvent.press(screen.getByTestId('jd-analyze'));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      copy.home.needResumeFirst,
    );
    expect(router.replace).toHaveBeenCalledWith('/resume/new');
    expect(router.push).not.toHaveBeenCalled();
  });
});
