import { TEMPLATE_FILTERS, copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavBar } from '../../components/NavBar';
import { TemplateThumb } from '../../components/TemplateThumb';
import { Badge, Tappable } from '../../components/ui';
import { useTemplates } from '../../lib/queries';
import { colors, radius, spacing } from '../../theme';

/** 模版库（截图 08）：岗位筛选胶囊 + 2×2 模版卡。 */
export default function TemplatesScreen() {
  const router = useRouter();
  const { data } = useTemplates();
  const [filter, setFilter] = useState<string | null>(null);

  const templates = useMemo(() => {
    const all = data ?? [];
    if (filter === null) return all;
    return all.filter((template) => template.categories.includes(filter));
  }, [data, filter]);

  return (
    <FlowScreen testID="screen-templates">
      <NavBar title={copy.templates.title} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {TEMPLATE_FILTERS.map((option) => {
          const isActive = option.match === filter;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              testID={`template-filter-${option.label}`}
              onPress={() => setFilter(option.match)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {templates.map((template) => (
            <Tappable
              key={template.key}
              accessibilityRole="button"
              testID={`template-${template.key}`}
              onPress={() => router.push(`/resume/template/${template.key}`)}
              style={styles.card}
            >
              <TemplateThumb templateKey={template.key} />
              <View style={styles.nameRow}>
                <Text style={styles.name}>{template.name}</Text>
                {template.isRecommended ? (
                  <Badge label={copy.templates.recommended} />
                ) : null}
              </View>
              <Text style={styles.usage}>{template.usageLabel}</Text>
            </Tappable>
          ))}
        </View>
      </ScrollView>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  chipsScroll: {
    flexGrow: 0,
    // 抵消 FlowScreen 的左右内边距，让胶囊可以贴边滚出去
    marginHorizontal: -spacing.screenX,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.screenX,
  },
  chip: {
    backgroundColor: colors.bg.card,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    // 两列：减去中间 12 的间隙
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.bg.card,
    borderRadius: radius.button,
    padding: 9,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 3,
  },
  name: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text.primary,
  },
  usage: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
    paddingHorizontal: 3,
  },
});
