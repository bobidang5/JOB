import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows } from '../theme';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

/**
 * iOS 风格的底部动作面板（截图 06）。
 *
 * 结构照原型：标题 + 选项在同一组圆角卡里，「取消」单独一组，
 * 两组之间间隔 9，整体左右 inset 10、距底 14。
 */
export function ActionSheet({
  visible,
  title,
  options,
  cancelLabel,
  onClose,
  testID,
}: {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  cancelLabel: string;
  onClose: () => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable
        style={styles.dim}
        accessibilityLabel="关闭"
        onPress={onClose}
      />
      <View
        style={[styles.sheet, { bottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <View style={styles.group}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {options.map((option, index) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              testID={option.testID}
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => [
                styles.option,
                index < options.length - 1 && styles.optionDivider,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  option.destructive && styles.destructive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          testID="action-sheet-cancel"
          onPress={onClose}
          style={({ pressed }) => [
            styles.group,
            styles.cancelGroup,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.cancelLabel}>{cancelLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
  },
  group: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 9,
    ...shadows.sheet,
  },
  title: {
    textAlign: 'center',
    fontSize: 12.5,
    color: colors.text.secondary,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider.hairline,
  },
  option: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider.hairline,
  },
  optionLabel: {
    fontSize: 17.5,
    color: colors.primary,
  },
  destructive: {
    color: colors.error,
  },
  cancelGroup: {
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: radius.button,
  },
  cancelLabel: {
    fontSize: 17.5,
    fontWeight: '700',
    color: colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
});
