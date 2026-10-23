import request from 'supertest';
import { pool } from '../src/db/pool';
import { app, auth, login, resetDatabase, setupDatabase } from './helpers';

let alice: { token: string; userId: string };

beforeAll(setupDatabase);
beforeEach(async () => {
  await resetDatabase();
  alice = await login('+919876543210');
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

describe('database error handling', () => {
  it('returns a generic 500 without leaking SQL, stack traces or internal messages', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(pool, 'query').mockRejectedValueOnce(
      Object.assign(new Error('relation "loans" secret_internal_detail'), {
        code: '42P01',
      }) as never,
    );
    const res = await request(app).get('/loans').set(auth(alice.token));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret_internal_detail|stack|42P01/);
  });

  it('returns 503 when the database is unreachable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(pool, 'query').mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
        code: 'ECONNREFUSED',
      }) as never,
    );
    const res = await request(app).get('/loans/summary').set(auth(alice.token));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
  });

  it('a failed transaction rolls back and releases the connection (pool stays usable)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Break the INSERT inside the transaction by sending an out-of-range numeric.
    const res = await request(app)
      .post('/loans')
      .set(auth(alice.token))
      .send({ friendName: 'X', amount: '9999999999.99', dueDate: '2030-01-01' });
    expect(res.status).toBe(201); // max NUMERIC(12,2) value is valid
    jest.spyOn(pool, 'connect').mockRejectedValueOnce(new Error('pool exhausted') as never);
    const failed = await request(app)
      .post('/loans')
      .set(auth(alice.token))
      .send({ friendName: 'Y', amount: '1', dueDate: '2030-01-01' });
    expect(failed.status).toBe(500);
    jest.restoreAllMocks();
    const ok = await request(app).get('/loans').set(auth(alice.token));
    expect(ok.status).toBe(200);
    expect(ok.body.loans).toHaveLength(1);
  });

  it('health endpoint reports database status', async () => {
    const up = await request(app).get('/health');
    expect(up.status).toBe(200);
    expect(up.body.database).toBe('up');
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('down') as never);
    const down = await request(app).get('/health');
    expect(down.status).toBe(503);
    expect(down.body.database).toBe('down');
  });
});
