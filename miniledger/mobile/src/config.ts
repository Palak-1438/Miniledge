import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolves the backend base URL.
 *
 * 1. EXPO_PUBLIC_API_URL (mobile/.env) always wins. REQUIRED for a real phone on a different
 *    network, tunnels, or deployed backends.
 * 2. Otherwise, in development the Expo dev server's host (your computer's LAN IP) is reused, so a
 *    physical phone running Expo Go reaches the backend on the same Wi-Fi without configuration.
 * 3. Last resort: Android emulator -> 10.0.2.2 (host loopback alias), iOS simulator -> localhost.
 *
 * `localhost` on a physical phone is the phone itself, never the development computer.
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;

  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_BASE_URL = resolveBaseUrl();
export const API_TIMEOUT_MS = 15_000;
export const OTP_RESEND_SECONDS = 30; // keep in sync with backend OTP_RESEND_COOLDOWN_SECONDS
