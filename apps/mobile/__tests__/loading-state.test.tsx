import { copy, MOCK_JD_TEXT } from '@zhiyou/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';
import RecordsScreen from '../app/(tabs)/records';
import JdScreen from '../app/optimize/jd';
import * as api from '../lib/api';
import { renderWithProviders } from './helpers';

/**
 * 「数据还没到」不等于「没有数据」。
 *
 * 首页、记录页、JD 页都从 useQuery 取快照，首帧 data 必然是 undefined。
 * 之前这三处都把 undefined 直接当成了「没有简历 / 没有记录」：
 *
 *   - 首页老用户会先闪一帧「先来创建你的第一份简历」引导卡；
 *   - 记录页会先闪一帧「还没有优化记录」；
 *   - 更糟的是点击——手快点一下「开始 AI 优化」或 JD 页的「开始分析」，
 *     会被误判成没有简历，弹提示并跳去新建页。明明简历是有的。
 *
 * 所以这一组用例全部**不预热缓存**，反过来钉住加载中的行为。
 * 它们和另外几个文件里「先 prefetch 再断言」的用例是一对：
 * 那边测状态本身，这边测状态还没确定时不许乱猜。
 */

/** 让查询永远悬着，把「加载中」这一帧固定下来 */
function freezeQueries() {
  const pending = new Promise<never>(() => {});
  jest.spyOn(api, 'getHomeSnapshot').mockReturnValue(pending);
  jest.spyOn(api, 'getRecords').mockReturnValue(pending);
}

beforeEach(() => {
  api.resetMockState(false); // 有简历、有记录：加载完成后本该是正常态
  freezeQueries();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('加载中不得渲染成空状态', () => {
  it('首页：既不出引导卡，也不出分数卡', () => {
    renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(screen.queryByTestId('home-empty-hero')).toBeNull();
    expect(screen.queryByText(copy.home.emptyTitle)).toBeNull();
    // 正常态的东西同样不该在，否则说明读到了别处的脏缓存
    expect(screen.queryByTestId('home-score-card')).toBeNull();
    expect(screen.queryByTestId('home-start-optimize')).toBeNull();
  });

  it('记录页：不出「还没有优化记录」', () => {
    renderWithProviders(<RecordsScreen />);

    expect(screen.getByTestId('screen-records')).toBeTruthy();
    expect(screen.queryByText(copy.records.empty)).toBeNull();
    expect(screen.queryByText(copy.records.summaryEmpty)).toBeNull();
  });
});

describe('加载中点按钮不得把人带错地方', () => {
  it('JD 页：JD 已达标但快照未到，点「开始分析」什么都不做', () => {
    renderWithProviders(<JdScreen />);

    fireEvent.changeText(screen.getByTestId('jd-input'), MOCK_JD_TEXT);
    fireEvent.press(screen.getByTestId('jd-analyze'));

    // 关键断言：不能跳去新建简历——那是「确实没有简历」才该走的分支
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.home.needResumeFirst)).toBeNull();
  });

  it('JD 页：即使数据未到，不足 50 字仍要照常报错', () => {
    renderWithProviders(<JdScreen />);

    fireEvent.changeText(screen.getByTestId('jd-input'), '太短了');
    fireEvent.press(screen.getByTestId('jd-analyze'));

    // 长度校验不依赖快照，不该被上面那道 guard 一起挡掉
    expect(screen.getByTestId('jd-error')).toBeTruthy();
    expect(screen.getByText(copy.jd.tooShort)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
