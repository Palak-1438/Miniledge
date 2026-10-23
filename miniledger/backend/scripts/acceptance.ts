/**
 * End-to-end acceptance check against a REAL running backend + PostgreSQL.
 * It performs exactly the HTTP calls the mobile screens make, reads the OTP from the server log
 * (like a developer would), and verifies persistence directly in the database.
 *
 *   BASE_URL=http://localhost:4000 LOG_FILE=/tmp/backend.log npx tsx scripts/acceptance.ts
 *   ... restart the backend ...
 *   PHASE=after-restart npx tsx scripts/acceptance.ts
 *
 * It only creates/deletes users with the reserved +1555000xxxx numbers below.
 */
import fs from 'fs';
import { Pool } from 'pg';
import '../src/config/env';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const LOG_FILE = process.env.LOG_FILE ?? '/tmp/backend.log';
const PHASE = process.env.PHASE ?? 'full';
const PHONE_A = '+15550001001';
const PHONE_B = '+15550001002';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${JSON.stringify(extra)}`}`);
};

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

function otpFromLog(phone: string): string {
  const lines = fs
    .readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.includes('[DEV OTP]') && l.includes(phone));
  const m = lines[lines.length - 1]?.match(/-> (\d{6})/);
  if (!m) throw new Error(`No OTP for ${phone} found in ${LOG_FILE}`);
  return m[1] as string;
}

async function login(phone: string) {
  const r = await api('POST', '/auth/request-otp', undefined, { phone });
  check(
    `request-otp ${phone} -> 200 and response does not contain an OTP`,
    r.status === 200 && !('otp' in r.body) && !/\d{6}/.test(JSON.stringify(r.body)),
    r,
  );
  await new Promise((r2) => setTimeout(r2, 300));
  const otp = otpFromLog(phone);
  const v = await api('POST', '/auth/verify-otp', undefined, { phone, otp });
  check(
    `verify-otp ${phone} with OTP from server log -> 200 + JWT`,
    v.status === 200 && typeof v.body.token === 'string',
    v,
  );
  return { token: v.body.token as string, userId: v.body.user.id as string };
}

const dayOffset = async (n: number) =>
  (
    await pool.query(`SELECT ((NOW() AT TIME ZONE $1)::date + $2::int)::text AS d`, [
      process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
      n,
    ])
  ).rows[0].d as string;

async function cleanup() {
  await pool.query('DELETE FROM users WHERE phone = ANY($1)', [[PHONE_A, PHONE_B]]);
  await pool.query('DELETE FROM otp_requests WHERE phone = ANY($1)', [[PHONE_A, PHONE_B]]);
}

async function full() {
  await cleanup();
  const health = await api('GET', '/health');
  check(
    'GET /health -> database up',
    health.status === 200 && health.body.database === 'up',
    health,
  );

  // Steps 5-8: login, dashboard loads
  const a = await login(PHONE_A);
  const l0 = await api('GET', '/loans', a.token);
  const s0 = await api('GET', '/loans/summary', a.token);
  check(
    'Dashboard loads: empty loans + zero summary',
    l0.status === 200 && l0.body.loans.length === 0 && s0.body.summary.totalLent === '0.00',
    { l0, s0 },
  );

  // Steps 9-12: Add Loan screen -> POST /loans -> persisted -> dashboard totals
  const due = await dayOffset(10);
  const created = await api('POST', '/loans', a.token, {
    friendName: 'Rahul Sharma',
    amount: '1500.50',
    dueDate: due,
  });
  check(
    'POST /loans -> 201',
    created.status === 201 && created.body.loan.amount === '1500.50',
    created,
  );
  const loanId = created.body.loan.id as string;
  const row = (
    await pool.query('SELECT *, due_date::text AS due_text FROM loans WHERE id = $1', [loanId])
  ).rows[0];
  check(
    'Loan persisted in PostgreSQL with correct owner/amount/due_date',
    row &&
      row.user_id === a.userId &&
      row.amount === '1500.50' &&
      row.due_text === due &&
      row.is_repaid === false,
    row,
  );
  const dup = await api('POST', '/loans', a.token, {
    friendName: 'Rahul Sharma',
    amount: '1500.50',
    dueDate: due,
  });
  check(
    'Rapid double-tap does not create a second loan',
    dup.status === 200 &&
      dup.body.duplicate === true &&
      (await pool.query('SELECT 1 FROM loans WHERE user_id=$1', [a.userId])).rowCount === 1,
    dup,
  );
  const l1 = await api('GET', '/loans', a.token);
  const s1 = (await api('GET', '/loans/summary', a.token)).body.summary;
  check('Loan appears in GET /loans', l1.body.loans.length === 1 && l1.body.loans[0].id === loanId);
  check(
    'Summary after create: lent 1500.50, repaid 0.00, outstanding 1500.50, overdue 0.00, count 1',
    s1.totalLent === '1500.50' &&
      s1.totalRepaid === '0.00' &&
      s1.outstandingAmount === '1500.50' &&
      s1.overdueAmount === '0.00' &&
      s1.totalLoans === 1,
    s1,
  );

  // Steps 13-14: repay
  const rep = await api('PATCH', `/loans/${loanId}/repay`, a.token);
  check(
    'PATCH repay -> 200, alreadyRepaid=false',
    rep.status === 200 && rep.body.alreadyRepaid === false,
    rep,
  );
  const row2 = (await pool.query('SELECT is_repaid, repaid_at FROM loans WHERE id = $1', [loanId]))
    .rows[0];
  check(
    'DB updated: is_repaid=true and repaid_at set',
    row2.is_repaid === true && row2.repaid_at !== null,
    row2,
  );
  const rep2 = await api('PATCH', `/loans/${loanId}/repay`, a.token);
  check(
    'Repeated repay is safe (200, alreadyRepaid=true, same repaid_at)',
    rep2.status === 200 &&
      rep2.body.alreadyRepaid === true &&
      rep2.body.loan.repaidAt === rep.body.loan.repaidAt,
    rep2,
  );
  const s2 = (await api('GET', '/loans/summary', a.token)).body.summary;
  check(
    'Summary after repay: repaid 1500.50, outstanding 0.00',
    s2.totalRepaid === '1500.50' && s2.outstandingAmount === '0.00',
    s2,
  );

  // Steps 15-16: overdue
  const overdueA = await api('POST', '/loans', a.token, {
    friendName: 'Late Larry',
    amount: '250.00',
    dueDate: await dayOffset(-5),
  });
  const overdueB = await api('POST', '/loans', a.token, {
    friendName: 'Paid Late Pat',
    amount: '999.99',
    dueDate: await dayOffset(-30),
  });
  await api('PATCH', `/loans/${overdueB.body.loan.id}/repay`, a.token);
  const list = (await api('GET', '/loans', a.token)).body.loans as any[];
  const s3 = (await api('GET', '/loans/summary', a.token)).body.summary;
  check(
    'Overdue unpaid loan is flagged isOverdue=true',
    overdueA.body.loan.isOverdue === true &&
      list.find((l) => l.friendName === 'Late Larry')?.isOverdue === true,
  );
  check(
    'Repaid loan with an old due date is NOT overdue',
    list.find((l) => l.friendName === 'Paid Late Pat')?.isOverdue === false,
  );
  check(
    'Summary: overdue 250.00 (repaid excluded), lent 2750.49, repaid 2500.49, outstanding 250.00, count 3',
    s3.overdueAmount === '250.00' &&
      s3.totalLent === '2750.49' &&
      s3.totalRepaid === '2500.49' &&
      s3.outstandingAmount === '250.00' &&
      s3.totalLoans === 3,
    s3,
  );

  // Step 17: second user
  const b = await login(PHONE_B);
  const bList = await api('GET', '/loans', b.token);
  const bSum = await api('GET', '/loans/summary', b.token);
  const bGet = await api('GET', `/loans/${loanId}`, b.token);
  const bRepay = await api('PATCH', `/loans/${overdueA.body.loan.id}/repay`, b.token);
  check(
    'User B sees no loans and zero summary',
    bList.body.loans.length === 0 && bSum.body.summary.totalLoans === 0,
  );
  check("User B cannot read user A's loan (404)", bGet.status === 404, bGet);
  check(
    "User B cannot repay user A's loan (404) and it stays unpaid",
    bRepay.status === 404 &&
      (await pool.query('SELECT is_repaid FROM loans WHERE id=$1', [overdueA.body.loan.id])).rows[0]
        .is_repaid === false,
    bRepay,
  );

  // Step 19: logout => client discards token; server rejects any unauthenticated call
  for (const [m, p] of [
    ['GET', '/loans'],
    ['GET', '/loans/summary'],
    ['POST', '/loans'],
    ['GET', `/loans/${loanId}`],
    ['PATCH', `/loans/${loanId}/repay`],
  ] as const) {
    const r = await api(m, p);
    check(`Without token ${m} ${p.replace(loanId, ':id')} -> 401`, r.status === 401, r);
  }
  const bad = await api('GET', '/loans', 'not.a.valid.token');
  check(
    'Invalid token -> 401 INVALID_TOKEN',
    bad.status === 401 && bad.body.error.code === 'INVALID_TOKEN',
    bad,
  );
  console.log(
    '\nNow restart the backend, then run:  PHASE=after-restart npx tsx scripts/acceptance.ts',
  );
}

async function afterRestart() {
  const a = await login(PHONE_A);
  const list = (await api('GET', '/loans', a.token)).body.loans as any[];
  const s = (await api('GET', '/loans/summary', a.token)).body.summary;
  check('After restart: all 3 loans still present', list.length === 3, list.length);
  check(
    'After restart: summary unchanged (lent 2750.49, repaid 2500.49, outstanding 250.00, overdue 250.00)',
    s.totalLent === '2750.49' &&
      s.totalRepaid === '2500.49' &&
      s.outstandingAmount === '250.00' &&
      s.overdueAmount === '250.00',
    s,
  );
  await cleanup();
  check(
    'Acceptance test users removed (cleanup)',
    (await pool.query('SELECT 1 FROM users WHERE phone = ANY($1)', [[PHONE_A, PHONE_B]]))
      .rowCount === 0,
  );
}

(PHASE === 'after-restart' ? afterRestart() : full())
  .catch((e) => {
    failures++;
    console.error('ERROR', e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await pool.end();
    console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failures ? 1 : 0);
  });
