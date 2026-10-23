import request from 'supertest';
import { pool } from '../src/db/pool';
import { app, auth, createLoan, dateOffset, login, resetDatabase, setupDatabase } from './helpers';

let alice: { token: string; userId: string };
let bob: { token: string; userId: string };

beforeAll(setupDatabase);
beforeEach(async () => {
  await resetDatabase();
  alice = await login('+919876543210');
  bob = await login('+919123456789');
});
afterAll(() => pool.end());

describe('POST /loans', () => {
  it('creates a loan for the authenticated user', async () => {
    const due = await dateOffset(10);
    const res = await createLoan(alice.token, {
      friendName: '  Priya Sharma ',
      amount: '1250.5',
      dueDate: due,
    });
    expect(res.status).toBe(201);
    expect(res.body.loan).toMatchObject({
      friendName: 'Priya Sharma', // trimmed
      amount: '1250.50',
      dueDate: due,
      isRepaid: false,
      repaidAt: null,
      isOverdue: false,
    });
    const { rows } = await pool.query('SELECT user_id, amount FROM loans');
    expect(rows).toEqual([{ user_id: alice.userId, amount: '1250.50' }]);
  });

  it('accepts numeric amounts with up to two decimals', async () => {
    expect((await createLoan(alice.token, { amount: 99.99 })).status).toBe(201);
    expect((await createLoan(alice.token, { amount: 5, friendName: 'B' })).status).toBe(201);
  });

  it.each([
    ['whitespace-only name', { friendName: '   ' }],
    ['empty name', { friendName: '' }],
    ['name too long', { friendName: 'x'.repeat(101) }],
    ['zero amount', { amount: '0' }],
    ['zero decimal amount', { amount: '0.00' }],
    ['negative amount', { amount: '-5' }],
    ['three decimals', { amount: '10.001' }],
    ['numeric three decimals', { amount: 10.001 }],
    ['non-numeric amount', { amount: 'abc' }],
    ['empty amount', { amount: '' }],
    ['exponent amount', { amount: '1e3' }],
    ['huge number', { amount: 1e21 }],
    ['too many integer digits', { amount: '12345678901' }],
    ['comma amount', { amount: '1,000' }],
    ['null amount', { amount: null }],
    ['impossible date', { dueDate: '2025-02-30' }],
    ['month 13', { dueDate: '2025-13-01' }],
    ['wrong format', { dueDate: '23/10/2026' }],
    ['text date', { dueDate: 'tomorrow' }],
    ['datetime string', { dueDate: '2026-10-23T10:00:00Z' }],
    ['null date', { dueDate: null }],
  ])('rejects %s', async (_label, patch) => {
    const res = await request(app)
      .post('/loans')
      .set(auth(alice.token))
      .send({ friendName: 'Rahul', amount: '100', dueDate: '2030-01-01', ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toBeDefined();
    expect((await pool.query('SELECT 1 FROM loans')).rowCount).toBe(0);
  });

  it('rejects missing fields with field-level messages', async () => {
    const res = await request(app).post('/loans').set(auth(alice.token)).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual([
      'amount',
      'dueDate',
      'friendName',
    ]);
  });

  it('rejects unknown fields (cannot inject user_id / isRepaid)', async () => {
    const res = await createLoan(alice.token, {});
    expect(res.status).toBe(201);
    const bad = await request(app).post('/loans').set(auth(alice.token)).send({
      friendName: 'X',
      amount: '5',
      dueDate: '2030-01-01',
      userId: bob.userId,
      isRepaid: true,
    });
    expect(bad.status).toBe(400);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/loans')
      .set(auth(alice.token))
      .set('Content-Type', 'application/json')
      .send('{"friendName": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('treats rapid identical submissions as one loan (double-tap protection)', async () => {
    const body = { friendName: 'Dup', amount: '75.00', dueDate: await dateOffset(3) };
    const [a, b, c] = await Promise.all([
      createLoan(alice.token, body),
      createLoan(alice.token, body),
      createLoan(alice.token, body),
    ]);
    expect([a.status, b.status, c.status].sort()).toEqual([200, 200, 201]);
    expect(new Set([a.body.loan.id, b.body.loan.id, c.body.loan.id]).size).toBe(1);
    expect((await pool.query('SELECT 1 FROM loans')).rowCount).toBe(1);
  });

  it('does not treat a different amount as a duplicate', async () => {
    expect((await createLoan(alice.token, { friendName: 'Z', amount: '10' })).status).toBe(201);
    expect((await createLoan(alice.token, { friendName: 'Z', amount: '11' })).status).toBe(201);
  });

  it('does not dedupe across different users', async () => {
    const body = { friendName: 'Same', amount: '10', dueDate: '2030-01-01' };
    expect((await createLoan(alice.token, body)).status).toBe(201);
    expect((await createLoan(bob.token, body)).status).toBe(201);
  });
});

describe('GET /loans and GET /loans/:id', () => {
  it("lists only the caller's loans, unpaid first by due date", async () => {
    const later = await createLoan(alice.token, {
      friendName: 'Later',
      dueDate: await dateOffset(20),
    });
    await createLoan(alice.token, { friendName: 'Sooner', dueDate: await dateOffset(2) });
    const paid = await createLoan(alice.token, {
      friendName: 'Paid',
      dueDate: await dateOffset(1),
    });
    await request(app).patch(`/loans/${paid.body.loan.id}/repay`).set(auth(alice.token));
    await createLoan(bob.token, { friendName: 'BobsLoan' });

    const res = await request(app).get('/loans').set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.loans.map((l: { friendName: string }) => l.friendName)).toEqual([
      'Sooner',
      'Later',
      'Paid',
    ]);
    expect(later.status).toBe(201);
  });

  it('returns an empty list for a new user', async () => {
    const res = await request(app).get('/loans').set(auth(alice.token));
    expect(res.body).toEqual({ loans: [] });
  });

  it('gets a single loan', async () => {
    const created = await createLoan(alice.token);
    const res = await request(app).get(`/loans/${created.body.loan.id}`).set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.loan.id).toBe(created.body.loan.id);
  });

  it('returns 400 for an invalid UUID', async () => {
    for (const path of ['/loans/123', '/loans/not-a-uuid', '/loans/123/repay']) {
      const res = path.endsWith('repay')
        ? await request(app).patch(path).set(auth(alice.token))
        : await request(app).get(path).set(auth(alice.token));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 404 for a nonexistent loan id', async () => {
    const ghost = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect((await request(app).get(`/loans/${ghost}`).set(auth(alice.token))).status).toBe(404);
    expect((await request(app).patch(`/loans/${ghost}/repay`).set(auth(alice.token))).status).toBe(
      404,
    );
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('cross-user access protection', () => {
  it("another user cannot read, repay or see someone else's loan, even with a valid id", async () => {
    const aliceLoan = await createLoan(alice.token, { friendName: 'Secret' });
    const id = aliceLoan.body.loan.id;

    const read = await request(app).get(`/loans/${id}`).set(auth(bob.token));
    expect(read.status).toBe(404); // indistinguishable from "does not exist"
    const repay = await request(app).patch(`/loans/${id}/repay`).set(auth(bob.token));
    expect(repay.status).toBe(404);

    const list = await request(app).get('/loans').set(auth(bob.token));
    expect(list.body.loans).toEqual([]);
    const summary = await request(app).get('/loans/summary').set(auth(bob.token));
    expect(summary.body.summary.totalLoans).toBe(0);

    // The loan is untouched
    const { rows } = await pool.query('SELECT is_repaid FROM loans WHERE id = $1', [id]);
    expect(rows[0].is_repaid).toBe(false);
  });
});

describe('PATCH /loans/:id/repay', () => {
  it('marks a loan repaid and sets repaid_at', async () => {
    const created = await createLoan(alice.token);
    const res = await request(app)
      .patch(`/loans/${created.body.loan.id}/repay`)
      .set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.alreadyRepaid).toBe(false);
    expect(res.body.loan.isRepaid).toBe(true);
    expect(res.body.loan.repaidAt).toEqual(expect.any(String));
    const { rows } = await pool.query('SELECT is_repaid, repaid_at FROM loans');
    expect(rows[0].is_repaid).toBe(true);
    expect(rows[0].repaid_at).not.toBeNull();
  });

  it('is idempotent: repeated repayment succeeds, flags alreadyRepaid, keeps the original repaid_at', async () => {
    const created = await createLoan(alice.token);
    const id = created.body.loan.id;
    const first = await request(app).patch(`/loans/${id}/repay`).set(auth(alice.token));
    const second = await request(app).patch(`/loans/${id}/repay`).set(auth(alice.token));
    expect(second.status).toBe(200);
    expect(second.body.alreadyRepaid).toBe(true);
    expect(second.body.loan.repaidAt).toBe(first.body.loan.repaidAt);
  });

  it('concurrent repay requests are safe and exactly one performs the update', async () => {
    const created = await createLoan(alice.token);
    const id = created.body.loan.id;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).patch(`/loans/${id}/repay`).set(auth(alice.token)),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.alreadyRepaid === false)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.loan.repaidAt)).size).toBe(1);
  });
});

describe('GET /loans/summary', () => {
  it('returns zeros for a user with no loans', async () => {
    const res = await request(app).get('/loans/summary').set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      totalLent: '0.00',
      totalRepaid: '0.00',
      outstandingAmount: '0.00',
      overdueAmount: '0.00',
      totalLoans: 0,
    });
  });

  it('calculates totals, outstanding and overdue correctly (and repaid loans are never overdue)', async () => {
    const yesterday = await dateOffset(-1);
    const today = await dateOffset(0);
    const tomorrow = await dateOffset(1);
    const longAgo = await dateOffset(-60);

    await createLoan(alice.token, { friendName: 'A', amount: '100.10', dueDate: yesterday }); // overdue
    await createLoan(alice.token, { friendName: 'B', amount: '200.20', dueDate: today }); // due today: NOT overdue
    await createLoan(alice.token, { friendName: 'C', amount: '300.30', dueDate: tomorrow }); // not overdue
    const d = await createLoan(alice.token, {
      friendName: 'D',
      amount: '400.40',
      dueDate: longAgo,
    });
    await request(app).patch(`/loans/${d.body.loan.id}/repay`).set(auth(alice.token)); // overdue date but repaid
    await createLoan(bob.token, { friendName: 'Other', amount: '9999', dueDate: longAgo }); // other user

    const res = await request(app).get('/loans/summary').set(auth(alice.token));
    expect(res.body.summary).toEqual({
      totalLent: '1001.00',
      totalRepaid: '400.40',
      outstandingAmount: '600.60',
      overdueAmount: '100.10',
      totalLoans: 4,
    });
  });

  it('flags overdue loans in the list and clears the flag after repayment', async () => {
    const created = await createLoan(alice.token, { dueDate: await dateOffset(-3) });
    expect(created.body.loan.isOverdue).toBe(true);
    const repaid = await request(app)
      .patch(`/loans/${created.body.loan.id}/repay`)
      .set(auth(alice.token));
    expect(repaid.body.loan.isOverdue).toBe(false);
    const sum = await request(app).get('/loans/summary').set(auth(alice.token));
    expect(sum.body.summary.overdueAmount).toBe('0.00');
    expect(sum.body.summary.totalRepaid).toBe('100.00');
  });

  it('is not confused with a loan id (route ordering)', async () => {
    const res = await request(app).get('/loans/summary').set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });
});

describe('database constraints', () => {
  it('enforces repaid_at consistency, positive amounts and non-blank names at the DB level', async () => {
    await expect(
      pool.query(
        `INSERT INTO loans (user_id, friend_name, amount, due_date, is_repaid) VALUES ($1,'x',5,'2030-01-01',TRUE)`,
        [alice.userId],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO loans (user_id, friend_name, amount, due_date) VALUES ($1,'x',0,'2030-01-01')`,
        [alice.userId],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO loans (user_id, friend_name, amount, due_date) VALUES ($1,'   ',5,'2030-01-01')`,
        [alice.userId],
      ),
    ).rejects.toThrow();
  });
});
