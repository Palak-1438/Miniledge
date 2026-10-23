import { env } from '../../config/env';
import { pool, withTransaction } from '../../db/pool';
import { notFound } from '../../utils/errors';

/**
 * Date policy: a loan is overdue when it is unpaid AND due_date < "today", where today is the
 * calendar date in APP_TIMEZONE (bound as $TZ). due_date is a DATE (no time zone), so a loan due
 * "today" is not overdue until the next day starts in that zone.
 */
const TODAY = (tzParam: string) => `(NOW() AT TIME ZONE ${tzParam})::date`;

const LOAN_COLUMNS = (tzParam: string) => `
  id, friend_name, amount, due_date, is_repaid, repaid_at, created_at,
  (NOT is_repaid AND due_date < ${TODAY(tzParam)}) AS is_overdue`;

interface LoanRow {
  id: string;
  friend_name: string;
  amount: string;
  due_date: string;
  is_repaid: boolean;
  repaid_at: Date | null;
  created_at: Date;
  is_overdue: boolean;
}

export const toLoanDto = (r: LoanRow) => ({
  id: r.id,
  friendName: r.friend_name,
  amount: r.amount, // NUMERIC kept as a string to avoid float rounding, e.g. "1250.50"
  dueDate: r.due_date,
  isRepaid: r.is_repaid,
  repaidAt: r.repaid_at ? r.repaid_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
  isOverdue: r.is_overdue,
});

// Identical submissions from the same user inside this window are treated as one (double-tap guard).
const DUPLICATE_WINDOW_SECONDS = 10;

export async function createLoan(
  userId: string,
  input: { friendName: string; amount: string; dueDate: string },
) {
  return withTransaction(async (client) => {
    // Serialize concurrent identical submissions for this user so the duplicate check is race-free.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${userId}|${input.friendName}|${input.amount}|${input.dueDate}`,
    ]);
    const dup = await client.query<LoanRow>(
      `SELECT ${LOAN_COLUMNS('$5')} FROM loans
        WHERE user_id = $1 AND friend_name = $2 AND amount = $3::numeric AND due_date = $4::date
          AND created_at > NOW() - make_interval(secs => ${DUPLICATE_WINDOW_SECONDS})
        ORDER BY created_at DESC LIMIT 1`,
      [userId, input.friendName, input.amount, input.dueDate, env.APP_TIMEZONE],
    );
    if (dup.rows[0]) return { loan: toLoanDto(dup.rows[0]), created: false };

    const ins = await client.query<LoanRow>(
      `INSERT INTO loans (user_id, friend_name, amount, due_date)
       VALUES ($1, $2, $3::numeric, $4::date)
       RETURNING ${LOAN_COLUMNS('$5')}`,
      [userId, input.friendName, input.amount, input.dueDate, env.APP_TIMEZONE],
    );
    return { loan: toLoanDto(ins.rows[0] as LoanRow), created: true };
  });
}

export async function listLoans(userId: string) {
  const { rows } = await pool.query<LoanRow>(
    `SELECT ${LOAN_COLUMNS('$2')} FROM loans
      WHERE user_id = $1
      ORDER BY is_repaid ASC, due_date ASC, created_at DESC
      LIMIT 500`,
    [userId, env.APP_TIMEZONE],
  );
  return rows.map(toLoanDto);
}

export async function getLoan(userId: string, id: string) {
  const { rows } = await pool.query<LoanRow>(
    `SELECT ${LOAN_COLUMNS('$3')} FROM loans WHERE id = $1 AND user_id = $2`,
    [id, userId, env.APP_TIMEZONE],
  );
  // Another user's loan is indistinguishable from a nonexistent one (404, not 403).
  if (!rows[0]) throw notFound('Loan not found');
  return toLoanDto(rows[0]);
}

/**
 * Idempotent: repaying an already-repaid loan returns the existing record unchanged
 * (repaid_at is NOT overwritten) with alreadyRepaid = true.
 */
export async function repayLoan(userId: string, id: string) {
  const upd = await pool.query<LoanRow>(
    `UPDATE loans SET is_repaid = TRUE, repaid_at = NOW()
      WHERE id = $1 AND user_id = $2 AND is_repaid = FALSE
      RETURNING ${LOAN_COLUMNS('$3')}`,
    [id, userId, env.APP_TIMEZONE],
  );
  if (upd.rows[0]) return { loan: toLoanDto(upd.rows[0]), alreadyRepaid: false };
  const loan = await getLoan(userId, id); // throws 404 if missing / not owned
  return { loan, alreadyRepaid: true };
}

export async function getSummary(userId: string) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount), 0)::numeric(14,2)::text                                                   AS total_lent,
       COALESCE(SUM(amount) FILTER (WHERE is_repaid), 0)::numeric(14,2)::text                          AS total_repaid,
       COALESCE(SUM(amount) FILTER (WHERE NOT is_repaid), 0)::numeric(14,2)::text                      AS outstanding,
       COALESCE(SUM(amount) FILTER (WHERE NOT is_repaid AND due_date < ${TODAY('$2')}), 0)::numeric(14,2)::text AS overdue,
       COUNT(*)::int                                                                    AS total_loans
     FROM loans WHERE user_id = $1`,
    [userId, env.APP_TIMEZONE],
  );
  const r = rows[0];
  return {
    totalLent: r.total_lent,
    totalRepaid: r.total_repaid,
    outstandingAmount: r.outstanding,
    overdueAmount: r.overdue,
    totalLoans: r.total_loans,
  };
}
