/**
 * Normalizes a phone number to E.164 (+<country code><number>, 8-15 digits).
 * Accepts spaces, dashes, dots and parentheses. A leading "00" is treated as "+".
 * The country code must be supplied (the app has a country-code field).
 * Returns null if the number is not plausible.
 */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-.()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!/^\+[1-9][0-9]{7,14}$/.test(s)) return null;
  return s;
}
