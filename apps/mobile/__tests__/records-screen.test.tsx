import { copy } from '@zhiyou/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import RecordsScreen from '../app/(tabs)/records';
import * as api from '../lib/api';
import { queryKeys } from '../lib/queries';
import { createTestQueryClient, renderWithProviders } from './helpers';

/** DESIGN-SPEC §5.4（记录页空状态）。 */

async function renderRecords() {
  const queryClient = createTestQueryClient();
  // 同首页：先预热，避免断在 data 还是 undefined 的那一帧上
  await queryClient.prefetchQuery({
    queryKey: queryKeys.records,
    queryFn: api.getRecords,
  });
  return renderWithProviders(<RecordsScreen />, { queryClient });
}

describe('§5.4 记录页空状态', () => {
  it('新用户：显示空状态文案，不渲染任何记录行', async () => {
    api.resetMockState(true);
    await renderRecords();

    expect(screen.getByTestId('records-empty')).toBeTruthy();
    expect(screen.getByText(copy.records.empty)).toBeTruthy();
    // 副标题也换成空态那句
    expect(screen.getByText(copy.records.summaryEmpty)).toBeTruthy();
    expect(screen.queryByText(/投向/)).toBeNull();
  });

  it('有记录时切回正常态：空状态消失，列表按 mock 顺序渲染', async () => {
    api.resetMockState(false);
    const records = await api.getRecords();
    await renderRecords();

    expect(screen.queryByTestId('records-empty')).toBeNull();
    expect(screen.queryByText(copy.records.empty)).toBeNull();

    for (const record of records) {
      const row = screen.getByTestId(`record-${record.id}`);
      expect(
        within(row).getByText(copy.records.delta(record.scoreBefore, record.scoreAfter)),
      ).toBeTruthy();
    }
  });

  it('副标题按真实记录汇总条数与平均提升', async () => {
    api.resetMockState(false);
    const records = await api.getRecords();
    const averageGain = Math.round(
      records.reduce((sum, r) => sum + (r.scoreAfter - r.scoreBefore), 0) /
        records.length,
    );
    await renderRecords();

    expect(
      screen.getByText(copy.records.summary(records.length, averageGain)),
    ).toBeTruthy();
  });

  it('点一行进对应简历详情', async () => {
    api.resetMockState(false);
    const records = await api.getRecords();
    const first = records[0]!;
    await renderRecords();

    fireEvent.press(screen.getByTestId(`record-${first.id}`));
    expect(router.push).toHaveBeenCalledWith(`/resume/${first.resumeId}`);
  });
});
