import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  kind: 'success' | 'error' | 'info';
  message: string;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function Banner({ kind, message, onDismiss, autoDismissMs }: Props) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, onDismiss, message]);

  const palette = {
    success: { bg: colors.primarySoft, fg: colors.primaryDark },
    error: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.warningSoft, fg: colors.warningText },
  }[kind];

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="alert"
      style={[styles.box, { backgroundColor: palette.bg }]}
    >
      <Text style={[styles.text, { color: palette.fg }]}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.md, borderRadius: radius.md },
  text: { fontSize: 14, fontWeight: '600' },
});
