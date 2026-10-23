import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { pool, withTransaction } from '../../db/pool';
import { AppError, unauthorized } from '../../utils/errors';

const hashOtp = (phone: string, code: string) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');

const generateOtp = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export async function requestOtp(phone: string): Promise<{ expiresInSeconds: number }> {
  const code = generateOtp();
  // Atomic upsert. The WHERE clause enforces the resend cooldown without a race:
  // if the existing row is too recent, nothing is updated and rowCount is 0.
  const result = await pool.query(
    `INSERT INTO otp_requests (phone, code_hash, expires_at, attempts, consumed_at, created_at)
     VALUES ($1, $2, NOW() + make_interval(secs => $3), 0, NULL, NOW())
     ON CONFLICT (phone) DO UPDATE
       SET code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           consumed_at = NULL,
           created_at = NOW()
     WHERE otp_requests.created_at <= NOW() - make_interval(secs => $4)`,
    [phone, hashOtp(phone, code), env.OTP_TTL_SECONDS, env.OTP_RESEND_COOLDOWN_SECONDS],
  );
  if (result.rowCount === 0) {
    throw new AppError(
      429,
      'OTP_RESEND_TOO_SOON',
      `Please wait ${env.OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`,
    );
  }
  if (env.NODE_ENV === 'production') {
    console.warn('[otp] No SMS provider configured; OTP was generated but not delivered.');
  } else if (env.NODE_ENV !== 'test') {
    // DEVELOPMENT ONLY mock delivery: the OTP is printed to the server console.
    console.log(`[DEV OTP] ${phone} -> ${code} (valid ${env.OTP_TTL_SECONDS}s)`);
  }
  return { expiresInSeconds: env.OTP_TTL_SECONDS };
}

type VerifyOutcome = { ok: true; userId: string; phone: string } | { ok: false; error: AppError };

export async function verifyOtp(phone: string, code: string) {
  const outcome = await withTransaction<VerifyOutcome>(async (client) => {
    const { rows } = await client.query(
      `SELECT code_hash, attempts, consumed_at, (expires_at <= NOW()) AS expired
         FROM otp_requests WHERE phone = $1 FOR UPDATE`,
      [phone],
    );
    const row = rows[0];
    const invalid = (): VerifyOutcome => ({
      ok: false,
      error: unauthorized('Invalid or expired OTP', 'INVALID_OTP'),
    });
    if (!row || row.consumed_at) return invalid();
    if (row.expired) {
      return {
        ok: false,
        error: unauthorized('OTP has expired. Request a new one.', 'OTP_EXPIRED'),
      };
    }
    if (row.attempts >= env.OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        error: new AppError(
          429,
          'OTP_ATTEMPTS_EXCEEDED',
          'Too many incorrect attempts. Request a new OTP.',
        ),
      };
    }
    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = Buffer.from(hashOtp(phone, code), 'hex');
    const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!matches) {
      await client.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE phone = $1', [
        phone,
      ]);
      return {
        ok: false,
        error: unauthorized('Incorrect OTP', 'INVALID_OTP'),
      };
    }
    // Success: burn the OTP (prevents reuse) and find-or-create the user, atomically.
    await client.query('UPDATE otp_requests SET consumed_at = NOW() WHERE phone = $1', [phone]);
    const user = await client.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone`,
      [phone],
    );
    return { ok: true, userId: user.rows[0].id, phone: user.rows[0].phone };
  });

  // Errors are thrown after COMMIT so the attempt counter increment is persisted.
  if (!outcome.ok) throw outcome.error;

  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: outcome.userId,
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  return { token, user: { id: outcome.userId, phone: outcome.phone } };
}
