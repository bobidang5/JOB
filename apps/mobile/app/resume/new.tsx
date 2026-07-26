import { copy } from '@zhiyou/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { NavBar } from '../../components/NavBar';
import { useToast } from '../../components/Toast';
import { ChevronIcon, GridIcon, UploadIcon } from '../../components/icons';
import { Badge, Card, GhostButton, Tappable } from '../../components/ui';
import * as api from '../../lib/api';
import { queryKeys, useHomeSnapshot } from '../../lib/queries';
import { colors, radius, spacing } from '../../theme';

/** 新建简历（截图 07）。 */
export default function NewResumeScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useHomeSnapshot();

  const [parsingFile, setParsingFile] = useState<string | null>(null);

  const upload = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/*',
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const file = picked.assets[0];
    if (!file) return;

    setParsingFile(file.name);
    try {
      // 真实实现会把文件传给 /api/resumes/parse 让 Claude 抽成结构化内容
      await api.importResume(file.name);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
      await queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
      toast.show(copy.newResume.parsed);
      router.dismissAll();
    } catch {
      toast.show(copy.newResume.parseFailed);
    } finally {
      setParsingFile(null);
    }
  }, [queryClient, router, toast]);

  return (
    <FlowScreen testID="screen-new-resume">
      <NavBar title={copy.newResume.title} />

      <Text style={styles.lead}>{copy.newResume.lead}</Text>

      <ChoiceCard
        icon={<UploadIcon size={26} />}
        title={copy.newResume.upload}
        subtitle={copy.newResume.uploadSub}
        onPress={() => void upload()}
        testID="new-resume-upload"
      />

      <ChoiceCard
        icon={<GridIcon size={26} />}
        title={copy.newResume.fromTemplate}
        badge={copy.newResume.fromTemplateBadge}
        subtitle={copy.newResume.fromTemplateSub}
        onPress={() => router.push('/resume/templates')}
        testID="new-resume-from-template"
      />

      {(data?.resumeCount ?? 0) > 0 ? (
        <GhostButton
          label={copy.newResume.myResumes(data?.resumeCount ?? 0)}
          onPress={() => router.push('/resume/list')}
          style={styles.myResumes}
        />
      ) : null}

      <LoadingOverlay
        visible={parsingFile !== null}
        message={copy.newResume.parsing(parsingFile ?? '')}
        testID="new-resume-parsing"
      />
    </FlowScreen>
  );
}

function ChoiceCard({
  icon,
  title,
  badge,
  subtitle,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tappable testID={testID} onPress={onPress} accessibilityRole="button">
      <Card padded={false} style={styles.choice}>
        <View style={styles.choiceIcon}>{icon}</View>
        <View style={styles.choiceText}>
          <View style={styles.choiceTitleRow}>
            <Text style={styles.choiceTitle}>{title}</Text>
            {badge ? <Badge label={badge} /> : null}
          </View>
          <Text style={styles.choiceSub}>{subtitle}</Text>
        </View>
        <ChevronIcon />
      </Card>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  lead: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 6,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 22,
    paddingHorizontal: spacing.card,
  },
  choiceIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.tint.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    flex: 1,
  },
  choiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  choiceSub: {
    fontSize: 13,
    lineHeight: 19.5,
    color: colors.text.secondary,
    marginTop: 4,
  },
  myResumes: {
    marginTop: 6,
  },
});
