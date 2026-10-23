import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Loan } from '../types/api';
import { colors, radius, shadow, spacing } from '../theme';
import { formatDueDate, formatMoney } from '../utils/format';
import { Button } from './Button';

interface Props {
  loan: Loan;
  onRepay: (loan: Loan) => void;
  repaying: boolean;
}

export function LoanCard({ loan, onRepay, repaying }: Props) {
  const status = loan.isRepaid
    ? { text: 'Repaid', fg: colors.primaryDark, bg: colors.primarySoft }
    : loan.isOverdue
      ? { text: 'Overdue', fg: colors.danger, bg: colors.dangerSoft }
      : { text: 'Pending', fg: colors.warningText, bg: colors.warningSoft };

  return (
    <View
      style={[styles.card, loan.isOverdue && styles.overdueCard, loan.isRepaid && styles.repaidCard]}
      testID={`loan-${loan.id}`}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {loan.friendName}
        </Text>
        <View style={[styles.chip, { backgroundColor: status.bg }]}>
          <Text style={[styles.chipText, { color: status.fg }]}>{status.text}</Text>
        </View>
      </View>
      <Text style={styles.amount}>{formatMoney(loan.amount)}</Text>
      <Text style={[styles.due, loan.isOverdue && { color: colors.danger, fontWeight: '700' }]}>
        {loan.isRepaid
          ? `Due ${formatDueDate(loan.dueDate)}`
          : loan.isOverdue
            ? `Overdue since ${formatDueDate(loan.dueDate)}`
            : `Due ${formatDueDate(loan.dueDate)}`}
      </Text>
      {!loan.isRepaid && (
        <Button
          title="Mark as Repaid"
          small
          variant="secondary"
          loading={repaying}
          onPress={() => onRepay(loan)}
          style={styles.repayBtn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
    borderLeftWidth: 5,
    borderLeftColor: colors.border,
    ...shadow,
  },
  overdueCard: { borderLeftColor: colors.danger },
  repaidCard: { borderLeftColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  amount: { fontSize: 22, fontWeight: '800', color: colors.text },
  due: { fontSize: 14, color: colors.textMuted },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  chipText: { fontSize: 12, fontWeight: '700' },
  repayBtn: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
