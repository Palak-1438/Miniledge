import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';

export const app = createApp();

export async function setupDatabase() {
  const dbName = new URL(env.DATABASE_URL).pathname.replace('/', '');
  if (!dbName.includes('test')) throw new Error('Refusing to touch a non-test database');
  await runMigrations();
}

export async function resetDatabase() {
  const dbName = new URL(env.DATABASE_URL).pathname.replace('/', '');
  if (!dbName.includes('test')) throw new Error('Refusing to truncate a non-test database');
  await pool.query('TRUNCATE loans, users, otp_requests RESTART IDENTITY CASCADE');
}

/** Real OTP flow through the API. randomInt is pinned only so the test knows the code. */
export async function login(phone: string): Promise<{ token: string; userId: string }> {
  const spy = jest.spyOn(crypto, 'randomInt').mockImplementationOnce((() => 123456) as never);
  const r1 = await request(app).post('/auth/request-otp').send({ phone });
  spy.mockRestore();
  if (r1.status !== 200)
    throw new Error(`request-otp failed: ${r1.status} ${JSON.stringify(r1.body)}`);
  const r2 = await request(app).post('/auth/verify-otp').send({ phone, otp: '123456' });
  if (r2.status !== 200)
    throw new Error(`verify-otp failed: ${r2.status} ${JSON.stringify(r2.body)}`);
  return { token: r2.body.token, userId: r2.body.user.id };
}

/** Calendar date (YYYY-MM-DD) in APP_TIMEZONE, offset by N days, computed by Postgres. */
export async function dateOffset(days: number): Promise<string> {
  const { rows } = await pool.query(`SELECT ((NOW() AT TIME ZONE $1)::date + $2::int)::text AS d`, [
    env.APP_TIMEZONE,
    days,
  ]);
  return rows[0].d;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createLoan(
  token: string,
  body: { friendName?: string; amount?: string | number; dueDate?: string } = {},
) {
  return request(app)
    .post('/loans')
    .set(auth(token))
    .send({
      friendName: 'Rahul',
      amount: '100.00',
      dueDate: await dateOffset(7),
      ...body,
    });
}
