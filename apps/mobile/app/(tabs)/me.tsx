import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { ScreenView } from '../../components/ScreenView';
import {
  BriefcaseIcon,
  ChevronIcon,
  DocIcon,
  SettingsIcon,
} from '../../components/icons';
import { BigTitle, Card, ListCard, ListRow, Tappable } from '../../components/ui';
import { useHomeSnapshot } from '../../lib/queries';
import { colors, spacing } from '../../theme';

/** 我的（截图 04）。 */
export default function MeScreen() {
  const router = useRouter();
  const { data } = useHomeSnapshot();

  const profile = data?.profile;
  const resumeCount = data?.resumeCount ?? 0;

  const jobTargetSub =
    profile && (profile.job_intent || profile.city)
      ? [profile.job_intent, profile.city].filter(Boolean).join(' · ')
      : copy.me.jobTargetEmpty;

  return (
    <ScreenView testID="screen-me">
      <BigTitle title={copy.me.title} />

      <Tappable
        accessibilityRole="button"
        testID="me-profile-card"
        onPress={() => router.push('/profile/edit')}
        scaleOnPress={false}
      >
        <Card style={styles.profileCard}>
          <Avatar
            name={profile?.full_name ?? ''}
            uri={profile?.avatar_url}
            size={56}
          />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{profile?.full_name ?? ''}</Text>
            <Text style={styles.profileSub}>
              {profile
                ? copy.me.profileSub(
                    profile.job_intent,
                    profile.years_experience,
                    profile.city,
                  )
                : ''}
            </Text>
          </View>
          <ChevronIcon />
        </Card>
      </Tappable>

      <ListCard>
        <ListRow
          first
          icon={<DocIcon size={20} />}
          title={copy.me.myResumes}
          subtitle={
            resumeCount > 0
              ? copy.me.myResumesCount(resumeCount)
              : copy.me.myResumesEmpty
          }
          onPress={() => router.push('/resume/list')}
          testID="me-resumes"
        />
        <ListRow
          icon={<BriefcaseIcon size={20} />}
          title={copy.me.jobTarget}
          subtitle={jobTargetSub}
          onPress={() => router.push('/optimize/jd')}
          testID="me-job-target"
        />
        <ListRow
          icon={<SettingsIcon size={20} />}
          title={copy.me.settings}
          subtitle={copy.me.settingsSub}
          onPress={() => router.push('/settings')}
          testID="me-settings"
        />
      </ListCard>
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.card,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  profileSub: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },
});
