import { MIN_JD_LENGTH, MOCK_JD_TEXT, copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavBar } from '../../components/NavBar';
import { useToast } from '../../components/Toast';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { useHomeSnapshot } from '../../lib/queries';
import { colors, radius, timings, typography } from '../../theme';

/**
 * 粘贴职位描述（截图 10 输入态 / 截图 11 异常态）。
 *
 * DESIGN-SPEC §5.1：去除首尾空格后不足 50 字 → 红描边 + 抖动 + 红字提示，
 * 达标后错误消失。字数实时更新。
 *
 * 原型里的假键盘不实现（§7 明确说明），真机用系统键盘。
 */
export default function JdScreen() {
  const router = useRouter();
  const toast = useToast();
  const flow = useOptimizeFlow();
  const { data } = useHomeSnapshot();

  const [text, setText] = useState(flow.jdText);
  const [showError, setShowError] = useState(false);
  const shake = useState(() => new Animated.Value(0))[0];

  const trimmedLength = text.trim().length;
  const isValid = trimmedLength >= MIN_JD_LENGTH;

  const handleChange = useCallback((next: string) => {
    setText(next);
    // 达标后错误立即消失（原型 jdInput()）
    if (next.trim().length >= MIN_JD_LENGTH) setShowError(false);
  }, []);

  const runShake = useCallback(() => {
    // 原型 @keyframes shake：0 → -6 → +5 → -3 → 0，共 400ms
    shake.setValue(0);
    const step = timings.shake / 4;
    Animated.sequence([
      Animated.timing(shake, { toValue: -6, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 5, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -3, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: step, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const pasteDemo = useCallback(() => {
    handleChange(MOCK_JD_TEXT);
    toast.show(copy.jd.pastedDemo);
  }, [handleChange, toast]);

  const analyze = useCallback(() => {
    if (!isValid) {
      setShowError(true);
      runShake();
      return;
    }

    // 同 useStartOptimize：data 未到时不能把「还没加载」当成「没有简历」
    if (!data) return;

    const resume = data.defaultResume;
    if (!resume) {
      toast.show(copy.home.needResumeFirst);
      router.replace('/resume/new');
      return;
    }

    flow.setJdText(text);
    flow.beginAnalysis({
      resumeId: resume.id,
      resumeTitle: resume.title,
      templateKey: resume.templateKey,
      scoreBefore: resume.score,
      content: resume.content,
      jdText: text.trim(),
    });
    router.push('/optimize/analyzing');
  }, [data, flow, isValid, router, runShake, text, toast]);

  return (
    <FlowScreen testID="screen-jd">
      <NavBar title={copy.jd.title} />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <Animated.View
          testID="jd-input-card"
          style={[
            styles.inputCard,
            showError && styles.inputCardError,
            { transform: [{ translateX: shake }] },
          ]}
        >
          <TextInput
            testID="jd-input"
            style={styles.input}
            value={text}
            onChangeText={handleChange}
            placeholder={copy.jd.placeholder}
            placeholderTextColor={colors.text.placeholder}
            multiline
            textAlignVertical="top"
            accessibilityLabel={copy.jd.title}
          />
        </Animated.View>

        <View style={styles.meta}>
          <Text testID="jd-error" style={styles.error}>
            {showError ? copy.jd.tooShort : ''}
          </Text>
          <Text testID="jd-count" style={styles.count}>
            {copy.jd.charCount(trimmedLength)}
          </Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            testID="jd-paste-demo"
            onPress={pasteDemo}
            style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
          >
            <Text style={styles.pasteLabel}>{copy.jd.pasteDemo}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="jd-analyze"
            onPress={analyze}
            style={({ pressed }) => [styles.goButton, pressed && styles.pressed]}
          >
            <Text style={styles.goLabel}>{copy.jd.analyze}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: 10,
  },
  inputCard: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputCardError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 24.65,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.text.primary,
  },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  error: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
  },
  count: {
    fontSize: 12,
    color: colors.text.tertiary,
  },

  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  pasteButton: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderRadius: radius.input,
    paddingVertical: 13,
    alignItems: 'center',
  },
  pasteLabel: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  goButton: {
    flex: 1.4,
    backgroundColor: colors.primary,
    borderRadius: radius.input,
    paddingVertical: 13,
    alignItems: 'center',
  },
  goLabel: {
    color: '#FFFFFF',
    fontWeight: typography.button.fontWeight,
    fontSize: 14,
  },
});
