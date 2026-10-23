import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

interface Props {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad';
  style?: object;
}

export function SummaryCard({ label, value, tone = 'neutral', style }: Props) {
  const color = tone === 'good' ? colors.primary : tone === 'bad' ? colors.danger : colors.text;
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    ...shadow,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: 18, fontWeight: '800' },
});
