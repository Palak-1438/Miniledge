import { z } from 'zod';
import { normalizePhone } from '../../utils/phone';

const phone = z
  .string({
    required_error: 'Phone number is required',
    invalid_type_error: 'Phone number must be text',
  })
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid phone number with country code, e.g. +919876543210',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const requestOtpSchema = z.object({ phone }).strict();

export const verifyOtpSchema = z
  .object({
    phone,
    otp: z
      .string({ required_error: 'OTP is required', invalid_type_error: 'OTP must be text' })
      .regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  })
  .strict();
