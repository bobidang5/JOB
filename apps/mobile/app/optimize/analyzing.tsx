import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CheckIcon, SparkIcon } from '../../components/icons';
import { useToast } from '../../components/Toast';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { colors, timings } from '../../theme';

/**
 * AI 分析中（截图 12）。
 *
 * DESIGN-SPEC §5.2 的时间轴是 0.7s / 1.5s / 2.2s 依次打勾、2.8s 跳转。
 * 但真实分析比 2.8s 慢，所以这里的规则是：
 *
 *   - 前两步按原时间轴打勾（读简历、对比 JD，是本来就该在本地完成的事）
 *   - 第三步「计算匹配度与差距」等接口真的返回才打勾，在那之前保持转圈
 *   - 跳转发生在「动画最短时长走完」且「接口已返回」都满足时
 *
 * 这样接口快时节奏与原型完全一致，接口慢时也不假装它已经算完了。
 *
 * 本页不可返回：栈手势在 _layout 里关掉，Android 实体返回键直接回首页。
 */
export default function AnalyzingScreen() {
  const router = useRouter();
  const toast = useToast();
  const flow = useOptimizeFlow();

  const [doneSteps, setDoneSteps] = useState(0);
  const [analysisDone, setAnalysisDone] = useState(false);
  const spin = useState(() => new Animated.Value(0))[0];

  // 返回即回首页（§5.2）
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        router.dismissAll();
        return true;
      },
    );
    return () => subscription.remove();
  }, [router]);

  // 光环持续旋转
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  // 前两步按原时间轴
  useEffect(() => {
    const [first, second] = timings.analyzeSteps;
    const timers = [
      setTimeout(() => setDoneSteps((n) => Math.max(n, 1)), first),
      setTimeout(() => setDoneSteps((n) => Math.max(n, 2)), second),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // 接口 + 最短停留，两个条件都满足才跳转
  useEffect(() => {
    let cancelled = false;

    const minimumWait = new Promise<void>((resolve) =>
      setTimeout(resolve, timings.analyzeMinimum),
    );

    (async () => {
      try {
        await flow.awaitAnalysis();
        if (cancelled) return;
        setDoneSteps(3);
        setAnalysisDone(true);

        await minimumWait;
        if (cancelled) return;
        // replace 而不是 push：分析页不该留在返回栈里
        router.replace('/optimize/match');
      } catch {
        if (cancelled) return;
        toast.show(copy.analyzing.failed);
        // 退回 JD 页，已输入的内容还在 flow.jdText 里
        router.replace('/optimize/jd');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow, router, toast]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const steps = [copy.analyzing.step1, copy.analyzing.step2, copy.analyzing.step3];

  return (
    <View style={styles.screen} testID="screen-analyzing">
      <View style={styles.center}>
        <View style={styles.pulse}>
          <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
          <View style={styles.core}>
            <SparkIcon size={30} color={colors.primary} />
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {copy.analyzing.title}
        </Text>

        <View style={styles.steps}>
          {steps.map((label, index) => {
            const isDone = index < doneSteps;
            // 第三步在等接口时转圈，而不是提前打勾
            const isWaiting = index === 2 && !analysisDone && doneSteps >= 2;
            return (
              <View key={label} style={styles.step} testID={`analyze-step-${index}`}>
                <View style={[styles.stepIcon, isDone && styles.stepIconDone]}>
                  {isDone ? (
                    <CheckIcon size={11} />
                  ) : isWaiting ? (
                    <ActivityIndicator size="small" color={colors.text.tertiary} />
                  ) : null}
                </View>
                <Text style={[styles.stepLabel, isDone && styles.stepLabelDone]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.screen,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },

  pulse: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(0,122,255,0.18)',
    borderTopColor: colors.primary,
  },
  core: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,122,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 26,
  },

  steps: {
    marginTop: 22,
    gap: 12,
    minWidth: 210,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bg.stepIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: colors.success,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.pending,
  },
  stepLabelDone: {
    color: colors.text.primary,
  },
});
