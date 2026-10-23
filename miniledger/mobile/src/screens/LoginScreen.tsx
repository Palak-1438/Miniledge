import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestOtp, verifyOtp } from '../api/auth';
import { ApiError } from '../api/client';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { OTP_RESEND_SECONDS } from '../config';
import { useAuth } from '../hooks/useAuth';
import { colors, font, radius, spacing } from '../theme';
import type { LoginScreenProps } from '../types/navigation';
import { buildPhone, validateOtp, validatePhone } from '../utils/validation';

export default function LoginScreen(_props: LoginScreenProps) {
  const { signIn, sessionNotice, clearNotice } = useAuth();
  const [countryCode, setCountryCode] = useState('+91');
  const [number, setNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState<'request' | 'verify' | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const busy = useRef(false); // synchronous guard against rapid double taps

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleRequestOtp = async () => {
    if (busy.current) return;
    setApiError(null);
    setSuccess(null);
    clearNotice();
    const err = validatePhone(countryCode, number);
    setPhoneError(err);
    if (err) return;
    busy.current = true;
    setLoading('request');
    try {
      await requestOtp(buildPhone(countryCode, number));
      setStep('otp');
      setOtp('');
      setOtpError(null);
      setCooldown(OTP_RESEND_SECONDS);
      setSuccess('OTP requested. In development, read it from the backend server console.');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'OTP_RESEND_TOO_SOON') {
          setStep('otp'); // an OTP already exists; let the user enter it
          setCooldown(OTP_RESEND_SECONDS);
        }
        setApiError(e.fields?.phone ?? e.message);
      } else setApiError('Something went wrong. Please try again.');
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const handleVerify = async () => {
    if (busy.current) return;
    setApiError(null);
    setSuccess(null);
    const err = validateOtp(otp);
    setOtpError(err);
    if (err) return;
    busy.current = true;
    setLoading('verify');
    try {
      const result = await verifyOtp(buildPhone(countryCode, number), otp);
      setSuccess('Logged in successfully!');
      await signIn(result.token, result.user); // stores JWT in SecureStore; navigator switches to Dashboard
    } catch (e) {
      setApiError(
        e instanceof ApiError ? (e.fields?.otp ?? e.message) : 'Something went wrong. Please try again.',
      );
      setSuccess(null);
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const changeNumber = () => {
    setStep('phone');
    setOtp('');
    setOtpError(null);
    setApiError(null);
    setSuccess(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>M</Text>
            </View>
            <Text style={styles.brandName}>MiniLedger</Text>
          </View>

          <View style={styles.header}>
            <Text style={font.title}>Welcome back 👋</Text>
            <Text style={styles.sub}>
              Track the money you lend to friends, see who has repaid, and never lose sight of what is
              overdue. Log in with your phone number.
            </Text>
          </View>

          {sessionNotice && <Banner kind="info" message={sessionNotice} onDismiss={clearNotice} />}
          {apiError && <Banner kind="error" message={apiError} onDismiss={() => setApiError(null)} />}
          {success && <Banner kind="success" message={success} />}

          <View style={styles.form}>
            <Text style={font.label}>Phone number</Text>
            <View style={styles.phoneRow}>
              <TextInput
                style={[styles.cc, !!phoneError && styles.ccError]}
                value={countryCode}
                onChangeText={(t) => setCountryCode(t.startsWith('+') ? t : `+${t.replace(/\+/g, '')}`)}
                keyboardType="phone-pad"
                maxLength={5}
                editable={step === 'phone' && !loading}
                accessibilityLabel="Country code"
                testID="country-code-input"
              />
              <TextInput
                style={[styles.phone, !!phoneError && styles.ccError]}
                value={number}
                onChangeText={(t) => setNumber(t.replace(/[^\d\s-]/g, ''))}
                placeholder="98765 43210"
                placeholderTextColor="#93A29B"
                keyboardType="phone-pad"
                maxLength={16}
                editable={step === 'phone' && !loading}
                accessibilityLabel="Phone number"
                testID="phone-input"
              />
            </View>
            {phoneError && <Text style={styles.error}>{phoneError}</Text>}

            {step === 'phone' ? (
              <Button
                title="Request OTP"
                onPress={handleRequestOtp}
                loading={loading === 'request'}
                disabled={loading !== null}
                testID="request-otp-button"
              />
            ) : (
              <>
                <TextField
                  label="Enter 6-digit OTP"
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="••••••"
                  error={otpError}
                  editable={!loading}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  testID="otp-input"
                />
                <Button
                  title="Verify OTP"
                  onPress={handleVerify}
                  loading={loading === 'verify'}
                  disabled={loading !== null}
                  testID="verify-otp-button"
                />
                <View style={styles.linksRow}>
                  <Pressable onPress={changeNumber} disabled={loading !== null}>
                    <Text style={styles.link}>Change number</Text>
                  </Pressable>
                  <Pressable onPress={handleRequestOtp} disabled={loading !== null || cooldown > 0}>
                    <Text
                      style={[styles.link, (loading !== null || cooldown > 0) && { color: colors.disabled }]}
                    >
                      {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <Text style={styles.devNote}>
            Development build: the OTP is printed in the backend server console, not sent by SMS.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.white, fontSize: 24, fontWeight: '900' },
  brandName: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  header: { gap: spacing.sm },
  sub: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  form: { gap: spacing.md },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  cc: {
    width: 76,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  phone: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  ccError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13, fontWeight: '500' },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14, paddingVertical: 6 },
  devNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
