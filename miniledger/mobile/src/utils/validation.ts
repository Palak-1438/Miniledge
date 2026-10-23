// Client-side validation. Mirrors the backend rules (the backend remains the source of truth).

export function buildPhone(countryCode: string, number: string): string {
  const cc = countryCode.replace(/[^\d]/g, '');
  const n = number.replace(/[^\d]/g, '');
  return `+${cc}${n}`;
}

export function validatePhone(countryCode: string, number: string): string | null {
  if (!countryCode.replace(/[^\d]/g, '')) return 'Enter a country code, e.g. +91';
  if (!number.replace(/[^\d]/g, '')) return 'Enter your phone number';
  if (!/^\+[1-9]\d{7,14}$/.test(buildPhone(countryCode, number))) {
    return 'Enter a valid phone number (8–15 digits including country code)';
  }
  return null;
}

export const validateOtp = (otp: string): string | null =>
  /^\d{6}$/.test(otp) ? null : 'Enter the 6-digit OTP';

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

export interface LoanFormErrors {
  friendName?: string;
  amount?: string;
  dueDate?: string;
}

export function validateLoanForm(values: {
  friendName: string;
  amount: string;
  dueDate: Date | null;
}): LoanFormErrors {
  const errors: LoanFormErrors = {};
  const name = values.friendName.trim();
  if (!name) errors.friendName = "Friend's name is required";
  else if (name.length > 100) errors.friendName = 'Name must be at most 100 characters';

  const amount = values.amount.trim();
  if (!amount) errors.amount = 'Amount is required';
  else if (/^\d+\.\d{3,}$/.test(amount)) errors.amount = 'Amount can have at most 2 decimal places';
  else if (!AMOUNT_RE.test(amount)) errors.amount = 'Enter a valid amount, e.g. 1500 or 1500.50';
  else if (Number(amount) <= 0) errors.amount = 'Amount must be greater than zero';

  if (!values.dueDate || Number.isNaN(values.dueDate.getTime())) errors.dueDate = 'Pick a due date';
  else if (values.dueDate.getFullYear() < 2000 || values.dueDate.getFullYear() > 2100) {
    errors.dueDate = 'Pick a due date between 2000 and 2100';
  }
  return errors;
}

/** Keeps digits and at most one decimal point while typing. */
export function sanitizeAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}
