import { z } from 'zod';
import { isValidIsoDate } from '../../utils/dates';

// NUMERIC(12,2): up to 10 integer digits and 2 decimals.
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

const amount = z
  .union([z.string(), z.number()], {
    errorMap: () => ({ message: 'Amount is required and must be a number' }),
  })
  .transform((v, ctx) => {
    // Numbers are stringified so "1e21" or 0.1+0.2 style artefacts fail the regex instead of rounding.
    const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'x') : v.trim();
    if (!AMOUNT_RE.test(s)) {
      const hasTooManyDecimals = /^\d+\.\d{3,}$/.test(s);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: hasTooManyDecimals
          ? 'Amount can have at most 2 decimal places'
          : 'Amount must be a positive number (digits with up to 2 decimals)',
      });
      return z.NEVER;
    }
    if (Number(s) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be greater than zero' });
      return z.NEVER;
    }
    return s;
  });

export const createLoanSchema = z
  .object({
    friendName: z
      .string({
        required_error: "Friend's name is required",
        invalid_type_error: "Friend's name must be text",
      })
      .transform((v) => v.trim())
      .pipe(
        z
          .string()
          .min(1, "Friend's name is required")
          .max(100, "Friend's name must be at most 100 characters"),
      ),
    amount,
    dueDate: z
      .string({
        required_error: 'Due date is required',
        invalid_type_error: 'Due date must be text',
      })
      .refine(isValidIsoDate, 'Due date must be a valid date in YYYY-MM-DD format'),
  })
  .strict();

export const idParamSchema = z.object({
  id: z.string().uuid('Loan id must be a valid UUID'),
});
