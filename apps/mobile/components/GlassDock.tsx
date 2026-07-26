import { BlurView } from 'expo-blur';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, dock, radius, shadows } from '../theme';
import { ClockIcon, HomeIcon, SparkIcon, UserIcon } from './icons';

/**
 * iOS 26 风格的 Liquid Glass 悬浮 Dock（DESIGN-SPEC §3.4）。
 *
 * 结构：左右 inset 16、距底 22 悬浮；一个胶囊 Tab 栏（高 66，内含 3 个
 * Tab）+ 右侧一个独立的圆形 AI 按钮（58）。AI 圆钮不是 Tab，它触发
 * 「开始 AI 优化」，和首页那个主按钮同一套分支逻辑（§5.4）。
 *
 * 关键约束：内容要能从玻璃下面穿过去（截图 01 的「最近记录」卡片就是
 * 这个效果），所以 Dock 是绝对定位的 overlay，不占布局；滚动内容自己
 * 在底部留出 dock.contentInset 的空白。
 *
 * 材质在 RN 里的对应关系：
 *   backdrop-filter: blur(22px) saturate(190%)  →  expo-blur 的 BlurView
 *     （iOS 上就是原生 UIVisualEffectView）
 *   background: rgba(252,253,255,.50)           →  叠在 BlurView 上的一层
 *   border: 1px rgba(255,255,255,.85)           →  borderWidth/borderColor
 *   box-shadow 外阴影                            →  shadows.glass
 *   inset 0 1.5px 0 rgba(255,255,255,.95)       →  顶部一条高光 View
 *     （RN 不支持 inset shadow）
 */

export type DockTabKey = 'home' | 'records' | 'me';

const TABS: {
  key: DockTabKey;
  label: string;
  Icon: typeof HomeIcon;
}[] = [
  { key: 'home', label: '首页', Icon: HomeIcon },
  { key: 'records', label: '记录', Icon: ClockIcon },
  { key: 'me', label: '我的', Icon: UserIcon },
];

/** 玻璃材质外壳，Tab 胶囊与 AI 圆钮共用 */
function Glass({
  children,
  style,
  borderRadius,
}: {
  children: React.ReactNode;
  style?: object;
  borderRadius: number;
}) {
  return (
    <View style={[styles.glassOuter, { borderRadius }, shadows.glass, style]}>
      <BlurView
        intensity={dock.blurIntensity}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <View
        style={[StyleSheet.absoluteFill, styles.glassFill, { borderRadius }]}
        pointerEvents="none"
      />
      <View
        style={[styles.glassHighlight, { borderRadius }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function GlassDock({
  active,
  onSelectTab,
  onPressAi,
}: {
  active: DockTabKey;
  onSelectTab: (key: DockTabKey) => void;
  onPressAi: () => void;
}) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Glass style={styles.pill} borderRadius={radius.pill}>
        {TABS.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
              testID={`dock-tab-${key}`}
              onPress={() => onSelectTab(key)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Icon
                size={24}
                color={isActive ? colors.primary : colors.text.muted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </Glass>

      <Glass style={styles.circle} borderRadius={dock.circleSize / 2}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="开始 AI 优化"
          testID="dock-ai-button"
          onPress={onPressAi}
          style={styles.circlePress}
        >
          <SparkIcon size={27} color={colors.primary} />
        </Pressable>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: dock.inset,
    right: dock.inset,
    bottom: dock.bottom,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dock.gap,
  },

  glassOuter: {
    borderWidth: 1,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  glassFill: {
    backgroundColor: colors.glass.fill,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: colors.glass.highlight,
  },

  pill: {
    flex: 1,
    height: dock.pillHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    height: dock.tabHeight,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.tint.lens,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
  },
  tabLabelActive: {
    color: colors.primary,
  },

  circle: {
    width: dock.circleSize,
    height: dock.circleSize,
  },
  circlePress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
