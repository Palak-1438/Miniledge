import crypto from 'crypto';
import request from 'supertest';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { app, resetDatabase, setupDatabase } from './helpers';

const PHONE = '+919876543210';

async function requestOtp(phone = PHONE, code = 123456) {
  const spy = jest.spyOn(crypto, 'randomInt').mockImplementationOnce((() => code) as never);
  const res = await request(app).post('/auth/request-otp').send({ phone });
  spy.mockRestore();
  return res;
}

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('POST /auth/request-otp', () => {
  it('accepts a valid phone, normalizes it, and does NOT return the OTP', async () => {
    const res = await requestOtp('+91 98765-43210', 654321);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('OTP requested');
    expect(JSON.stringify(res.body)).not.toContain('654321');
    expect(res.body).not.toHaveProperty('otp');
    const { rows } = await pool.query('SELECT phone, code_hash, attempts FROM otp_requests');
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('+919876543210'); // normalized to E.164
    expect(rows[0].code_hash).not.toContain('654321'); // stored hashed, never plain
  });

  it('generates a six-digit code (zero-padded) and prints it to the console outside test mode', async () => {
    const original = env.NODE_ENV;
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    env.NODE_ENV = 'development';
    try {
      const res = await requestOtp(PHONE, 42);
      expect(res.status).toBe(200);
      const printed = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[DEV OTP]'));
      expect(printed).toMatch(/\+919876543210 -> 000042 /);
    } finally {
      env.NODE_ENV = original;
      log.mockRestore();
    }
  });

  it.each([['abc'], ['12345'], [''], ['+0123456789'], ['9876543210'], ['+91 98765 4321012345678']])(
    'rejects invalid phone %p',
    async (phone) => {
      const res = await request(app).post('/auth/request-otp').send({ phone });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('rejects missing phone and non-string phone', async () => {
    expect((await request(app).post('/auth/request-otp').send({})).status).toBe(400);
    expect(
      (await request(app).post('/auth/request-otp').send({ phone: 919876543210 })).status,
    ).toBe(400);
  });

  it('enforces the resend cooldown', async () => {
    env.OTP_RESEND_COOLDOWN_SECONDS = 30;
    try {
      expect((await requestOtp()).status).toBe(200);
      const again = await requestOtp();
      expect(again.status).toBe(429);
      expect(again.body.error.code).toBe('OTP_RESEND_TOO_SOON');
    } finally {
      env.OTP_RESEND_COOLDOWN_SECONDS = 0;
    }
  });
});

describe('POST /auth/verify-otp', () => {
  it('logs in with the correct OTP, creates the user, returns a JWT, then uses it', async () => {
    await requestOtp();
    const res = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.phone).toBe(PHONE);
    const users = await pool.query('SELECT phone FROM users');
    expect(users.rows).toEqual([{ phone: PHONE }]);

    const me = await request(app).get('/loans').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it('does not create a duplicate user on second login (same user id)', async () => {
    await requestOtp();
    const a = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' });
    await requestOtp(PHONE, 111111);
    const b = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '111111' });
    expect(b.status).toBe(200);
    expect(b.body.user.id).toBe(a.body.user.id);
    expect((await pool.query('SELECT 1 FROM users')).rowCount).toBe(1);
  });

  it('rejects a wrong OTP and increments attempts', async () => {
    await requestOtp();
    const res = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_OTP');
    const { rows } = await pool.query('SELECT attempts FROM otp_requests');
    expect(rows[0].attempts).toBe(1);
    expect((await pool.query('SELECT 1 FROM users')).rowCount).toBe(0);
  });

  it('rejects verification when no OTP was requested', async () => {
    const res = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_OTP');
  });

  it('rejects an expired OTP even when the code is correct', async () => {
    await requestOtp();
    await pool.query(`UPDATE otp_requests SET expires_at = NOW() - interval '1 second'`);
    const res = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
    expect((await pool.query('SELECT 1 FROM users')).rowCount).toBe(0);
  });

  it('locks out after the max number of wrong attempts, even for the correct code', async () => {
    await requestOtp();
    for (let i = 0; i < env.OTP_MAX_ATTEMPTS; i++) {
      const r = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '999999' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: PHONE, otp: '123456' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    // A fresh OTP request resets the counter
    await requestOtp(PHONE, 222222);
    const ok = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '222222' });
    expect(ok.status).toBe(200);
  });

  it('prevents OTP reuse after successful verification', async () => {
    await requestOtp();
    expect(
      (await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' })).status,
    ).toBe(200);
    const reuse = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_OTP');
  });

  it('only one of two concurrent verifications with the same OTP succeeds', async () => {
    await requestOtp();
    const [a, b] = await Promise.all([
      request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' }),
      request(app).post('/auth/verify-otp').send({ phone: PHONE, otp: '123456' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('an OTP for one phone cannot verify another phone', async () => {
    await requestOtp(PHONE);
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ phone: '+919999999999', otp: '123456' });
    expect(res.status).toBe(401);
  });

  it.each([['12345'], ['1234567'], ['abcdef'], ['12 456']])(
    'rejects malformed OTP %p',
    async (otp) => {
      const res = await request(app).post('/auth/verify-otp').send({ phone: PHONE, otp });
      expect(res.status).toBe(400);
    },
  );
});

describe('JWT / authentication middleware', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/loans');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([['Bearer'], ['Bearer not.a.jwt'], ['Basic abc'], ['abc']])(
    'rejects malformed Authorization header %p',
    async (header) => {
      const res = await request(app).get('/loans').set('Authorization', header);
      expect(res.status).toBe(401);
    },
  );

  it('rejects a token signed with a different secret', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.sign({}, 'x'.repeat(40), {
      subject: '11111111-1111-4111-8111-111111111111',
    });
    const res = await request(app).get('/loans').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const jwt = await import('jsonwebtoken');
    const expired = jwt.sign({}, env.JWT_SECRET, {
      subject: '11111111-1111-4111-8111-111111111111',
      expiresIn: -10,
    });
    const res = await request(app).get('/loans').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects unsigned (alg: none) tokens', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '11111111-1111-4111-8111-111111111111' })}.`;
    const res = await request(app).get('/loans').set('Authorization', `Bearer ${none}`);
    expect(res.status).toBe(401);
  });

  it('protects every private endpoint', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const calls = [
      request(app).post('/loans').send({}),
      request(app).get('/loans'),
      request(app).get('/loans/summary'),
      request(app).get(`/loans/${id}`),
      request(app).patch(`/loans/${id}/repay`),
    ];
    for (const c of calls) expect((await c).status).toBe(401);
  });
});
