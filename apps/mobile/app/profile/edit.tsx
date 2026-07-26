import { copy, type Profile } from '@zhiyou/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '../../components/ActionSheet';
import { Avatar } from '../../components/Avatar';
import { FieldEditor } from '../../components/FieldEditor';
import { FlowScreen } from '../../components/FlowScreen';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { NavAction, NavBar } from '../../components/NavBar';
import { useToast } from '../../components/Toast';
import { CameraIcon, ChevronIcon } from '../../components/icons';
import { ListCard } from '../../components/ui';
import * as api from '../../lib/api';
import { queryKeys, useProfile } from '../../lib/queries';
import { colors, radius, spacing, timings } from '../../theme';

type FieldKey = keyof Pick<
  Profile,
  'full_name' | 'job_intent' | 'years_experience' | 'city' | 'phone' | 'email'
>;

const FIELDS: {
  key: FieldKey;
  label: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
}[] = [
  { key: 'full_name', label: copy.profile.fieldName },
  { key: 'job_intent', label: copy.profile.fieldJobIntent },
  { key: 'years_experience', label: copy.profile.fieldYears, keyboardType: 'numeric' },
  { key: 'city', label: copy.profile.fieldCity },
  { key: 'phone', label: copy.profile.fieldPhone, keyboardType: 'phone-pad' },
  { key: 'email', label: copy.profile.fieldEmail, keyboardType: 'email-address' },
];

/** 个人资料（截图 05）+ 头像动作面板（截图 06）。 */
export default function ProfileEditScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useProfile();

  // 只存本地改动，渲染时叠在服务端数据之上——比用 effect 把 props
  // 同步进 state 少一次级联渲染，也不会出现「数据回来了但表单还是空的」。
  const [edits, setEdits] = useState<Partial<Profile>>({});
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const draft = useMemo<Profile | null>(
    () => (data ? { ...data, ...edits } : null),
    [data, edits],
  );

  const displayValue = useCallback(
    (key: FieldKey): string => {
      if (!draft) return '';
      if (key === 'years_experience') {
        return draft.years_experience === null
          ? copy.profile.unset
          : copy.profile.yearsValue(draft.years_experience);
      }
      const value = draft[key];
      return value.length > 0 ? value : copy.profile.unset;
    },
    [draft],
  );

  const editValue = useCallback(
    (key: FieldKey): string => {
      if (!draft) return '';
      if (key === 'years_experience') {
        return draft.years_experience === null ? '' : String(draft.years_experience);
      }
      return draft[key];
    },
    [draft],
  );

  const commitField = useCallback(
    (key: FieldKey, next: string) => {
      setEdits((prev) => {
        if (key === 'years_experience') {
          const parsed = Number.parseInt(next.trim(), 10);
          return {
            ...prev,
            years_experience: Number.isFinite(parsed) ? Math.max(0, parsed) : null,
          };
        }
        return { ...prev, [key]: next.trim() };
      });
      setEditing(null);
    },
    [],
  );

  const save = useCallback(async () => {
    if (draft) await api.updateProfile(draft);
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    toast.show(copy.profile.saved);
    router.back();
  }, [draft, queryClient, router, toast]);

  const pickAvatar = useCallback(
    async (source: 'camera' | 'album') => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.show(copy.avatarSheet.permissionDenied);
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1] })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
            });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      setUploadMessage(
        source === 'camera' ? copy.avatarSheet.processing : copy.avatarSheet.uploading,
      );
      try {
        // 真实实现会把文件传到 Supabase Storage 的 avatars/{user_id}/ 下
        await new Promise((resolve) => setTimeout(resolve, timings.avatarUpload));
        setEdits((prev) => ({ ...prev, avatar_url: asset.uri }));
        await api.updateProfile({ avatar_url: asset.uri });
        await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
        await queryClient.invalidateQueries({ queryKey: queryKeys.home });
        toast.show(copy.avatarSheet.updated);
      } finally {
        setUploadMessage(null);
      }
    },
    [queryClient, toast],
  );

  const editingField = FIELDS.find((field) => field.key === editing);

  return (
    <FlowScreen testID="screen-profile-edit" gap={14}>
      <NavBar
        title={copy.profile.title}
        right={
          <NavAction
            label={copy.common.save}
            onPress={() => void save()}
            testID="profile-save"
          />
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.avatarSheet.title}
            testID="profile-avatar"
            onPress={() => setSheetOpen(true)}
            style={styles.avatarWrap}
          >
            <Avatar
              name={draft?.full_name ?? ''}
              uri={draft?.avatar_url}
              size={86}
            />
            <View style={styles.cameraBadge}>
              <CameraIcon size={15} />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>{copy.profile.avatarHint}</Text>
        </View>

        <ListCard style={styles.fieldCard}>
          {FIELDS.map((field, index) => (
            <Pressable
              key={field.key}
              accessibilityRole="button"
              testID={`profile-field-${field.key}`}
              onPress={() => setEditing(field.key)}
              style={({ pressed }) => [
                styles.fieldRow,
                index > 0 && styles.fieldDivider,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <View style={styles.fieldValueWrap}>
                <Text style={styles.fieldValue}>{displayValue(field.key)}</Text>
                <ChevronIcon size={15} />
              </View>
            </Pressable>
          ))}
        </ListCard>

        <Text style={styles.footnote}>{copy.profile.footnote}</Text>
      </ScrollView>

      <ActionSheet
        visible={sheetOpen}
        title={copy.avatarSheet.title}
        cancelLabel={copy.common.cancel}
        onClose={() => setSheetOpen(false)}
        options={[
          {
            label: copy.avatarSheet.camera,
            onPress: () => void pickAvatar('camera'),
            testID: 'avatar-camera',
          },
          {
            label: copy.avatarSheet.album,
            onPress: () => void pickAvatar('album'),
            testID: 'avatar-album',
          },
        ]}
      />

      <FieldEditor
        key={editing ?? 'none'}
        visible={editingField !== undefined}
        label={editingField?.label ?? ''}
        value={editing ? editValue(editing) : ''}
        keyboardType={editingField?.keyboardType}
        onCancel={() => setEditing(null)}
        onSubmit={(next) => editing && commitField(editing, next)}
      />

      <LoadingOverlay
        visible={uploadMessage !== null}
        message={uploadMessage ?? ''}
        testID="avatar-uploading"
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
    paddingBottom: 24,
  },
  avatarWrap: {
    width: 86,
    alignSelf: 'center',
    marginTop: 8,
  },
  cameraBadge: {
    position: 'absolute',
    right: -3,
    bottom: -1,
    width: 29,
    height: 29,
    borderRadius: 14.5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg.screen,
  },
  avatarHint: {
    textAlign: 'center',
    fontSize: 12.5,
    color: colors.text.tertiary,
    marginTop: 10,
  },

  fieldCard: {
    paddingVertical: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14.5,
    paddingHorizontal: spacing.card,
    borderRadius: radius.small,
  },
  fieldDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider.row,
  },
  pressed: {
    opacity: 0.6,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  fieldValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fieldValue: {
    fontSize: 14.5,
    color: colors.text.secondary,
  },

  footnote: {
    textAlign: 'center',
    fontSize: 12.5,
    color: colors.text.tertiary,
  },
});
