import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScreenView } from '../../components/ScreenView';
import { DocIcon } from '../../components/icons';
import { BigTitle, EmptyNote, ListCard, ListRow } from '../../components/ui';
import { formatRecordSubtitle, summarizeRecords } from '../../lib/format';
import { useRecords } from '../../lib/queries';
import { colors } from '../../theme';

/** 记录（截图 03）。空态见 DESIGN-SPEC §5.6。 */
export default function RecordsScreen() {
  const router = useRouter();
  const { data } = useRecords();

  // 同首页：data 未到时不能把「还没加载」渲染成「还没有优化记录」
  if (!data) return <ScreenView testID="screen-records">{null}</ScreenView>;

  const records = data;
  const { count, averageGain } = summarizeRecords(records);

  return (
    <ScreenView testID="screen-records">
      <BigTitle
        title={copy.records.title}
        subtitle={
          count > 0
            ? copy.records.summary(count, averageGain)
            : copy.records.summaryEmpty
        }
      />

      {records.length > 0 ? (
        <ListCard>
          {records.map((record, index) => (
            <ListRow
              key={record.id}
              first={index === 0}
              showChevron={false}
              icon={<DocIcon size={20} />}
              title={record.resumeTitle}
              subtitle={formatRecordSubtitle(record.createdAt, record.company)}
              right={
                <Text style={styles.delta}>
                  {copy.records.delta(record.scoreBefore, record.scoreAfter)}
                </Text>
              }
              onPress={() => router.push(`/resume/${record.resumeId}`)}
              testID={`record-${record.id}`}
            />
          ))}
        </ListCard>
      ) : (
        <EmptyNote text={copy.records.empty} testID="records-empty" />
      )}
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  delta: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.successText,
  },
});
