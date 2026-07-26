import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

/**
 * 头像。没有照片时显示姓名末字（原型的「婷」），有照片时显示照片。
 * 我的页 56、个人资料页 86。
 */
export function Avatar({
  name,
  uri,
  size = 56,
  testID,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  testID?: string;
}) {
  const initial = name.trim().slice(-1);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.36 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.avatar.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: colors.avatar.text,
    fontWeight: '800',
  },
});
