import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavBar } from '../../components/NavBar';
import { DocIcon } from '../../components/icons';
import { EmptyNote, ListCard, ListRow } from '../../components/ui';
import { useResumes, useTemplates } from '../../lib/queries';
import { colors } from '../../theme';

/**
 * 我的简历列表。
 *
 * 原型里「我的简历」直接跳到那一份简历，因为演示数据只有一份可展示。
 * 真实数据允许多份（截图 04 写的就是「2 份」），所以这里先列出来再进详情。
 */
export default function ResumeListScreen() {
  const router = useRouter();
  const { data: resumes } = useResumes();
  const { data: templates } = useTemplates();

  const list = resumes ?? [];

  return (
    <FlowScreen testID="screen-resume-list">
      <NavBar title={copy.resume.title} />

      {list.length > 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <ListCard>
            {list.map((resume, index) => {
              const template = templates?.find((t) => t.key === resume.templateKey);
              return (
                <ListRow
                  key={resume.id}
                  first={index === 0}
                  icon={<DocIcon size={20} />}
                  title={resume.title}
                  subtitle={template?.name}
                  right={<Text style={styles.score}>{resume.score}</Text>}
                  onPress={() => router.push(`/resume/${resume.id}`)}
                  testID={`resume-item-${resume.id}`}
                />
              );
            })}
          </ListCard>
        </ScrollView>
      ) : (
        <EmptyNote text={copy.me.myResumesEmpty} />
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  score: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
