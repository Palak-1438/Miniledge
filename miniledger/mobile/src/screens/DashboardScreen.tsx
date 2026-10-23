import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { repayLoan } from '../api/loans';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { LoanCard } from '../components/LoanCard';
import { SummaryCard } from '../components/SummaryCard';
import { useAuth } from '../hooks/useAuth';
import { useLoans } from '../hooks/useLoans';
import { colors, font, radius, spacing } from '../theme';
import type { Loan } from '../types/api';
import type { DashboardScreenProps } from '../types/navigation';
import { formatMoney, greeting, maskPhone } from '../utils/format';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

export default function DashboardScreen({ navigation, route }: DashboardScreenProps) {
  const { user, signOut } = useAuth();
  const { loans, summary, status, refreshing, error, load, refresh, retry } = useLoans();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [repayingId, setRepayingId] = useState<string | null>(null);
  const repaying = useRef(false);

  // Fetch on first focus and refetch every time we come back (e.g. after Add Loan).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Success notice passed back from Add Loan via typed route params (derived, no effect needed).
  const notice = route.params?.notice;
  const banner: Feedback = feedback ?? (notice ? { kind: 'success', message: notice } : null);
  const dismissBanner = () => {
    setFeedback(null);
    if (notice) navigation.setParams({ notice: undefined });
  };

  const confirmRepay = (loan: Loan) => {
    Alert.alert(
      'Mark as repaid?',
      `Confirm that ${loan.friendName} has repaid ${formatMoney(loan.amount)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, mark repaid', onPress: () => void doRepay(loan) },
      ],
    );
  };

  const doRepay = async (loan: Loan) => {
    if (repaying.current) return;
    repaying.current = true;
    setRepayingId(loan.id);
    dismissBanner();
    try {
      await repayLoan(loan.id);
      setFeedback({ kind: 'success', message: `${loan.friendName}'s loan marked as repaid.` });
      await load(); // refresh loans + summary
    } catch (e) {
      setFeedback({
        kind: 'error',
        message: e instanceof ApiError ? e.message : 'Could not update the loan. Please try again.',
      });
    } finally {
      repaying.current = false;
      setRepayingId(null);
    }
  };

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You will need to verify your phone number again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const header = (
    <View style={styles.headerContent}>
      {banner && (
        <Banner
          kind={banner.kind}
          message={banner.message}
          onDismiss={dismissBanner}
          autoDismissMs={banner.kind === 'success' ? 4000 : undefined}
        />
      )}
      {error && status === 'ready' && <Banner kind="error" message={`Couldn't refresh: ${error}`} />}
      {summary && (
        <>
          <View style={styles.cardRow}>
            <SummaryCard label="Total Lent" value={formatMoney(summary.totalLent)} />
            <SummaryCard label="Total Repaid" value={formatMoney(summary.totalRepaid)} tone="good" />
          </View>
          <View style={styles.cardRow}>
            <SummaryCard
              label="Overdue Amount"
              value={formatMoney(summary.overdueAmount)}
              tone={Number(summary.overdueAmount) > 0 ? 'bad' : 'neutral'}
            />
            <SummaryCard label="Outstanding" value={formatMoney(summary.outstandingAmount)} />
          </View>
          <Text style={font.small}>
            {summary.totalLoans} {summary.totalLoans === 1 ? 'loan' : 'loans'} in total
          </Text>
        </>
      )}
      {loans.length > 0 && <Text style={font.h2}>Your loans</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>MiniLedger</Text>
          <Text style={styles.greeting}>
            {greeting()}
            {user?.phone ? ` · ${maskPhone(user.phone)}` : ''}
          </Text>
        </View>
        <Button title="Logout" variant="ghost" small onPress={confirmLogout} testID="logout-button" />
      </View>

      {status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>Loading your ledger…</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn&apos;t load your ledger</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>{error}</Text>
          <Button title="Retry" onPress={retry} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
        </View>
      ) : (
        <FlatList
          data={loans}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => (
            <LoanCard loan={item} onRepay={confirmRepay} repaying={repayingId === item.id} />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No loans yet</Text>
              <Text style={[styles.muted, { textAlign: 'center' }]}>
                Lent money to a friend? Tap &ldquo;Add Loan&rdquo; to start tracking it.
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      <View style={styles.footer}>
        <Button title="+ Add Loan" onPress={() => navigation.navigate('AddLoan')} testID="add-loan-button" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brand: { fontSize: 22, fontWeight: '900', color: colors.primaryDark },
  greeting: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  headerContent: { gap: spacing.md, marginBottom: spacing.md },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  muted: { fontSize: 14, color: colors.textMuted },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.danger },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
