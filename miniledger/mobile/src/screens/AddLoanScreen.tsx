import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { createLoan } from '../api/loans';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing } from '../theme';
import type { AddLoanScreenProps } from '../types/navigation';
import { formatDueDate, formatMoney, toIsoDate } from '../utils/format';
import { LoanFormErrors, sanitizeAmountInput, validateLoanForm } from '../utils/validation';

export default function AddLoanScreen({ navigation }: AddLoanScreenProps) {
  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [errors, setErrors] = useState<LoanFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false); // synchronous guard: state updates are async, rapid taps are not

  const onPickDate = (_e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowIosPicker(false);
    if (date) {
      setDueDate(date);
      setErrors((prev) => ({ ...prev, dueDate: undefined }));
    }
  };

  const openDatePicker = () => {
    if (saving) return;
    const value = dueDate ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value, mode: 'date', onChange: onPickDate });
    } else {
      setShowIosPicker((s) => !s);
    }
  };

  const handleSave = async () => {
    if (submitting.current) return;
    setApiError(null);
    const validation = validateLoanForm({ friendName, amount, dueDate });
    setErrors(validation);
    if (Object.keys(validation).length > 0 || !dueDate) return;

    submitting.current = true;
    setSaving(true);
    try {
      const loan = await createLoan({
        friendName: friendName.trim(),
        amount: amount.trim(),
        dueDate: toIsoDate(dueDate),
      });
      setSaved(true);
      navigation.navigate('Dashboard', {
        notice: `Loan of ${formatMoney(loan.amount)} to ${loan.friendName} added.`,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.fields) {
          setErrors({
            friendName: e.fields.friendName,
            amount: e.fields.amount,
            dueDate: e.fields.dueDate,
          });
        }
        setApiError(e.fields ? 'Please fix the highlighted fields.' : e.message);
      } else {
        setApiError('Something went wrong. Please try again.');
      }
      submitting.current = false;
      setSaving(false);
    }
    // On success the screen unmounts; keep the guard locked so a late tap can't create a duplicate.
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {apiError && <Banner kind="error" message={apiError} onDismiss={() => setApiError(null)} />}
        {saved && <Banner kind="success" message="Loan saved!" />}

        <TextField
          label="Friend's name"
          value={friendName}
          onChangeText={(t) => {
            setFriendName(t);
            if (errors.friendName) setErrors((p) => ({ ...p, friendName: undefined }));
          }}
          placeholder="e.g. Rahul Sharma"
          autoCapitalize="words"
          maxLength={100}
          editable={!saving}
          error={errors.friendName}
          testID="friend-name-input"
        />

        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={(t) => {
            setAmount(sanitizeAmountInput(t));
            if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          editable={!saving}
          error={errors.amount}
          hint="Up to 2 decimal places"
          testID="amount-input"
        />

        <View style={{ gap: 6 }}>
          <Text style={font.label}>Due date</Text>
          <Pressable
            onPress={openDatePicker}
            accessibilityRole="button"
            accessibilityLabel="Pick due date"
            style={[styles.dateField, !!errors.dueDate && { borderColor: colors.danger }]}
            testID="due-date-field"
          >
            <Text style={[styles.dateText, !dueDate && { color: '#93A29B' }]}>
              {dueDate ? formatDueDate(toIsoDate(dueDate)) : 'Select a date'}
            </Text>
            <Text>📅</Text>
          </Pressable>
          {errors.dueDate ? (
            <Text style={styles.error}>{errors.dueDate}</Text>
          ) : (
            <Text style={font.small}>Loans past their due date are shown as overdue.</Text>
          )}
          {Platform.OS === 'ios' && showIosPicker && (
            <DateTimePicker
              value={dueDate ?? new Date()}
              mode="date"
              display="inline"
              onChange={onPickDate}
            />
          )}
        </View>

        <View style={styles.actions}>
          <Button
            title="Save Loan"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            testID="save-loan-button"
          />
          <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} disabled={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.xl },
  dateField: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontSize: 16, color: colors.text },
  error: { color: colors.danger, fontSize: 13, fontWeight: '500' },
  actions: { gap: spacing.md, marginTop: spacing.sm },
});
