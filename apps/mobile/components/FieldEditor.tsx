import { copy } from '@zhiyou/shared';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, shadows, spacing } from '../theme';

/**
 * 单字段编辑弹层，用于个人资料页的六行。
 *
 * 原型这几行是 toast 占位，但这些字段要用来生成简历基本信息栏
 * （截图 05 底部就写着这句），所以做成真的可编辑。
 */
export function FieldEditor({
  visible,
  label,
  value,
  keyboardType = 'default',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  label: string;
  value: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  // 初值即当前字段值。父组件按正在编辑的字段传 key，切换字段时组件
  // 重新挂载，所以不需要用 effect 从 props 往 state 同步。
  const [draft, setDraft] = useState(value);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.dim} accessibilityLabel="关闭" onPress={onCancel} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerer}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            testID="field-editor-input"
            value={draft}
            onChangeText={setDraft}
            keyboardType={keyboardType}
            autoFocus
            style={styles.input}
            placeholderTextColor={colors.text.placeholder}
            onSubmitEditing={() => onSubmit(draft)}
            returnKeyType="done"
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              testID="field-editor-cancel"
              onPress={onCancel}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={styles.cancel}>{copy.common.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="field-editor-submit"
              onPress={() => onSubmit(draft)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={styles.confirm}>{copy.common.done}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenX,
  },
  card: {
    width: '100%',
    backgroundColor: colors.bg.card,
    borderRadius: radius.card,
    padding: spacing.card,
    gap: 12,
    ...shadows.sheet,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  input: {
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.bg.subtle,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  action: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.55,
  },
  cancel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  confirm: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
