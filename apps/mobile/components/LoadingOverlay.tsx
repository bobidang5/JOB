import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows } from '../theme';

/**
 * 全屏遮罩 + 转圈卡片（原型 .overlay / .ovcard）。
 * 用于「正在解析：xxx.pdf…」「AI 正在把你的内容填入模版…」「正在上传头像…」。
 */
export function LoadingOverlay({
  visible,
  message,
  testID,
}: {
  visible: boolean;
  message: string;
  testID?: string;
}) {
  const spin = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!visible) return;
    spin.setValue(0);
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin, visible]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.overlay} testID={testID}>
      <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.tintLayer} />
      <View style={styles.card}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 45,
  },
  tintLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(247,247,250,0.6)',
  },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.card,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 14,
    ...shadows.sheet,
  },
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: 'rgba(0,122,255,0.15)',
    borderTopColor: colors.primary,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
