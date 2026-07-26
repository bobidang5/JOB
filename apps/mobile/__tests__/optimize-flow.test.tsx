import { MOCK_ANALYSIS, MOCK_JD_TEXT, copy } from '@zhiyou/shared';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';
import RecordsScreen from '../app/(tabs)/records';
import DoneScreen from '../app/optimize/done';
import SuggestionsScreen from '../app/optimize/suggestions';
import * as api from '../lib/api';
import { useOptimizeFlow } from '../lib/optimizeFlow';
import { queryKeys } from '../lib/queries';
import { createTestQueryClient, renderWithProviders } from './helpers';

/**
 * DESIGN-SPEC §5.3：一次优化完成后，首页简历分同步更新、记录列表头部
 * 插入新条目。
 *
 * 这条规则跨了「流程状态 → 数据层 → 两个一级页」三层，所以用整链路测：
 * 把完成页与两个一级页挂在同一份 QueryClient / OptimizeFlowProvider 下，
 * 走真实的 beginAnalysis → decide → commit，最后点完成页右上角的「完成」，
 * 断言两个列表页自己跟着变。只测 api 层的话，漏掉 invalidateQueries 也
 * 照样绿。
 */

/** 把 flow 的当前值抓出来，供用例像用户一样一条条采纳 */
let flowValue: ReturnType<typeof useOptimizeFlow> | null = null;

function FlowCapture() {
  const flow = useOptimizeFlow();
  // 在 effect 里而不是渲染中赋值：渲染必须是纯的，React Compiler 的
  // lint 规则会拦。用例的每次交互都包在 act() 里，effect 已经刷完了。
  React.useEffect(() => {
    flowValue = flow;
  }, [flow]);
  return null;
}

function getFlow(): ReturnType<typeof useOptimizeFlow> {
  if (!flowValue) throw new Error('OptimizeFlowProvider 还没挂载');
  return flowValue;
}

function Harness() {
  return (
    <>
      <FlowCapture />
      <DoneScreen />
      <HomeScreen />
      <RecordsScreen />
    </>
  );
}

/**
 * 采纳这条线单独一份 harness：把真实的 SuggestionsScreen 也挂上。
 *
 * 上面那组用例是直接调 flow.decide(true) 驱动的，跳过了「哪个按钮算采纳」
 * 这一段接线。实测把 suggestions.tsx 的「采纳」与「跳过」接反、或让
 * decide(false) 也计入采纳，那组用例照样全绿——§5.2 说的是「每采纳 1 条
 * +2」，「采纳」是个用户动作，所以必须从按钮按下去才算覆盖到。
 */
function AdoptHarness() {
  return (
    <>
      <FlowCapture />
      <SuggestionsScreen />
      <DoneScreen />
      <HomeScreen />
    </>
  );
}

async function renderFlow(harness: React.ReactElement = <Harness />) {
  const queryClient = createTestQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.home,
    queryFn: api.getHomeSnapshot,
  });
  await queryClient.prefetchQuery({
    queryKey: queryKeys.records,
    queryFn: api.getRecords,
  });
  return renderWithProviders(harness, { queryClient });
}

/** 在建议页上一条条按按钮：decisions[i] 为 true 表示第 i 条点「采纳」 */
async function decideByPressing(decisions: readonly boolean[]) {
  for (const adopt of decisions) {
    await act(async () => {
      fireEvent.press(
        screen.getByTestId(adopt ? 'suggestion-adopt' : 'suggestion-skip'),
      );
    });
  }
}

/** 走完「粘贴 JD → 分析 → 采纳 adoptCount 条」，停在完成页之前 */
async function runAnalysisAndAdopt(adoptCount: number) {
  const snapshot = await api.getHomeSnapshot();
  const resume = snapshot.defaultResume;
  if (!resume) throw new Error('mock 状态里应当有一份默认简历');

  await act(async () => {
    getFlow().beginAnalysis({
      resumeId: resume.id,
      resumeTitle: resume.title,
      templateKey: resume.templateKey,
      scoreBefore: resume.score,
      content: resume.content,
      jdText: MOCK_JD_TEXT,
    });
  });

  await act(async () => {
    await getFlow().awaitAnalysis();
  });

  for (let i = 0; i < adoptCount; i += 1) {
    // 每次 decide 之后组件会重渲染，flowValue 也随之更新，所以要重新取
    act(() => {
      getFlow().decide(true);
    });
  }

  return resume;
}

beforeEach(() => {
  flowValue = null;
  api.resetMockState(false);
});

describe('§5.3 完成后首页与记录同步', () => {
  it('采纳 4 条 → 首页简历分 76 变 84，记录头部多出一条 76 → 84', async () => {
    await renderFlow();

    const resume = await runAnalysisAndAdopt(MOCK_ANALYSIS.suggestions.length);
    const recordsBefore = await api.getRecords();

    // 完成页先给出结论
    expect(screen.getByTestId('done-new-score')).toHaveTextContent('84');
    expect(screen.getByTestId('done-gain')).toHaveTextContent(copy.done.gain(8));

    // 点「完成」之前，首页还是旧分数
    expect(
      within(screen.getByTestId('home-score-card')).getByText(String(resume.score)),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    // 首页分数卡跟着变
    expect(within(screen.getByTestId('home-score-card')).getByText('84')).toBeTruthy();

    // 记录列表：多一条，且新的那条在最前面
    const recordsAfter = await api.getRecords();
    expect(recordsAfter).toHaveLength(recordsBefore.length + 1);

    const rows = screen.getAllByTestId(/^record-/);
    expect(rows.map((row) => row.props.testID)).toEqual(
      recordsAfter.map((record) => `record-${record.id}`),
    );

    const head = within(rows[0]!);
    expect(head.getByText(copy.records.delta(76, 84))).toBeTruthy();
    expect(head.getByText('刚刚 · 投向字节跳动')).toBeTruthy();

    // 清栈回首页 + 轻反馈
    expect(router.dismissAll).toHaveBeenCalled();
    expect(await screen.findByTestId('toast')).toHaveTextContent(copy.done.saved);
  });

  it('采纳 2 条 → 76 + 2×2 = 80，落到首页与记录里的也是 80', async () => {
    await renderFlow();
    await runAnalysisAndAdopt(2);

    expect(screen.getByTestId('done-new-score')).toHaveTextContent('80');

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    expect(within(screen.getByTestId('home-score-card')).getByText('80')).toBeTruthy();

    const rows = screen.getAllByTestId(/^record-/);
    expect(within(rows[0]!).getByText(copy.records.delta(76, 80))).toBeTruthy();
  });

  it('采纳的改写真的落进了简历内容，而不只是加了分', async () => {
    await renderFlow();
    const resume = await runAnalysisAndAdopt(MOCK_ANALYSIS.suggestions.length);

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    const saved = await api.getResume(resume.id);
    expect(saved?.score).toBe(84);
    expect(saved?.content.summary).toBe('3 年增长型产品人：擅长用数据实验驱动转化提升');
    expect(saved?.content.skills).toBe('熟练使用 SQL 与 A/B 测试 支撑增长决策');
  });

  it('一条都不采纳：分数不动，但仍然留下一条记录', async () => {
    await renderFlow();
    const recordsBefore = await api.getRecords();
    await runAnalysisAndAdopt(0);

    expect(screen.getByTestId('done-summary')).toHaveTextContent(
      copy.done.summaryNoneAdopted,
    );
    // 没有提升就不显示 +N 分的胶囊
    expect(screen.queryByTestId('done-gain')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    expect(within(screen.getByTestId('home-score-card')).getByText('76')).toBeTruthy();
    const recordsAfter = await api.getRecords();
    expect(recordsAfter).toHaveLength(recordsBefore.length + 1);
    expect(recordsAfter[0]?.scoreAfter).toBe(76);
  });

  it('新用户完成第一次优化后，两个空状态同时消失', async () => {
    api.resetMockState(true);
    // 先有一份简历才谈得上优化——走「上传已有简历」那条入口
    const created = await api.importResume('产品经理-李婷.pdf');

    const { queryClient } = await renderFlow();
    // 空状态渲染完毕：引导卡与记录空态都在
    expect(screen.getByTestId('records-empty')).toBeTruthy();

    await act(async () => {
      await queryClient.invalidateQueries();
    });
    expect(screen.getByTestId('home-score-card')).toBeTruthy();

    await runAnalysisAndAdopt(MOCK_ANALYSIS.suggestions.length);
    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    expect(screen.queryByTestId('home-empty-hero')).toBeNull();
    expect(screen.queryByTestId('records-empty')).toBeNull();
    expect(within(screen.getByTestId('home-score-card')).getByText('84')).toBeTruthy();
    expect(screen.getAllByTestId(/^record-/)).toHaveLength(1);
    expect((await api.getResume(created.id))?.score).toBe(84);
  });
});

describe('§5.2 「采纳」是按出来的：采纳 +2、跳过不加分', () => {
  const TOTAL = MOCK_ANALYSIS.suggestions.length;

  /** 分析跑完、停在第一条建议上 */
  async function arriveAtSuggestions() {
    await renderFlow(<AdoptHarness />);
    const resume = await runAnalysisAndAdopt(0);

    // 进度只能按文案找：NavAction 在没有 onPress 时会把 testID 丢掉
    // （components/NavBar.tsx 的提前 return），suggestion-progress-label
    // 其实从没进过渲染树。
    expect(screen.getByText(copy.suggestions.progress(1, TOTAL))).toBeTruthy();
    expect(screen.getByTestId('suggestion-old')).toHaveTextContent(
      MOCK_ANALYSIS.suggestions[0]!.original_text,
    );
    return resume;
  }

  it('四条都点「采纳这条建议」→ 76 → 84，且逐条前进', async () => {
    await arriveAtSuggestions();

    await decideByPressing([true]);
    // 按一下就翻到下一条，进度也跟着走
    expect(screen.getByText(copy.suggestions.progress(2, TOTAL))).toBeTruthy();
    expect(screen.getByTestId('suggestion-old')).toHaveTextContent(
      MOCK_ANALYSIS.suggestions[1]!.original_text,
    );

    await decideByPressing([true, true, true]);

    expect(screen.getByTestId('done-new-score')).toHaveTextContent('84');
    expect(screen.getByTestId('done-summary')).toHaveTextContent(
      new RegExp(`已采纳 ${TOTAL} 条建议`),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });
    expect(within(screen.getByTestId('home-score-card')).getByText('84')).toBeTruthy();
  });

  it('四条都点「跳过」→ 分数一分不动，改写也不落地', async () => {
    const resume = await arriveAtSuggestions();

    await decideByPressing([false, false, false, false]);

    expect(screen.getByTestId('done-new-score')).toHaveTextContent('76');
    expect(screen.getByTestId('done-summary')).toHaveTextContent(
      copy.done.summaryNoneAdopted,
    );
    expect(screen.queryByTestId('done-gain')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    expect(within(screen.getByTestId('home-score-card')).getByText('76')).toBeTruthy();
    const saved = await api.getResume(resume.id);
    expect(saved?.score).toBe(76);
    // 跳过的那条技能改写没有写进简历
    expect(saved?.content.skills).toBe('熟悉常用办公软件与数据工具');
  });

  it('采纳 2 条 + 跳过 2 条 → 80，且只有被采纳的那两条落地', async () => {
    const resume = await arriveAtSuggestions();

    // 第 1 条（exp[0].lis[0]）采纳、第 2 条（skills）跳过、
    // 第 3 条（summary）采纳、第 4 条（projects[0].lis[0]）跳过
    await decideByPressing([true, false, true, false]);

    expect(screen.getByTestId('done-new-score')).toHaveTextContent('80');
    expect(screen.getByTestId('done-gain')).toHaveTextContent(copy.done.gain(4));
    expect(screen.getByTestId('done-summary')).toHaveTextContent(/已采纳 2 条建议/);

    await act(async () => {
      fireEvent.press(screen.getByTestId('done-finish'));
    });

    const saved = await api.getResume(resume.id);
    expect(saved?.score).toBe(80);
    expect(saved?.content.exp[0]?.lis[0]).toBe(
      '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%',
    );
    expect(saved?.content.summary).toBe('3 年增长型产品人：擅长用数据实验驱动转化提升');
    // 跳过的两条保持原样
    expect(saved?.content.skills).toBe('熟悉常用办公软件与数据工具');
    expect(saved?.content.projects[0]?.lis[0]).toBe('参与了用户增长相关项目');
  });
});
