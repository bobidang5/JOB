import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

/**
 * 优化建议页顶部的细进度条（原型 .pg / .pg i）：
 * 高 4、轨道 #E9E9EE、填充主色，宽度变化 350ms。
 */
export function ProgressBar({
  progress,
  testID,
}: {
  /** 0–1 */
  progress: number;
  testID?: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const width = useState(() => new Animated.Value(clamped))[0];

  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 350,
      // 宽度不是 transform，只能走 JS driver
      useNativeDriver: false,
    }).start();
  }, [clamped, width]);

  return (
    <View style={styles.track} testID={testID}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bg.track,
    overflow: 'hidden',
    flexShrink: 0,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
