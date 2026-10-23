import type { AuthResult } from '../types/api';
import { http } from './client';

export async function requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
  const { data } = await http.post('/auth/request-otp', { phone });
  return { expiresInSeconds: data.expiresInSeconds };
}

export async function verifyOtp(phone: string, otp: string): Promise<AuthResult> {
  const { data } = await http.post<AuthResult>('/auth/verify-otp', { phone, otp });
  return data;
}
