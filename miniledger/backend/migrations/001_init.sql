-- MiniLedger initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_name  TEXT NOT NULL CHECK (char_length(btrim(friend_name)) BETWEEN 1 AND 100),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date     DATE NOT NULL,
  is_repaid    BOOLEAN NOT NULL DEFAULT FALSE,
  repaid_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- repaid_at must be set exactly when the loan is repaid
  CONSTRAINT loans_repaid_consistency CHECK (
    (is_repaid = TRUE AND repaid_at IS NOT NULL) OR (is_repaid = FALSE AND repaid_at IS NULL)
  )
);

CREATE INDEX idx_loans_user_created ON loans (user_id, created_at DESC);
-- speeds up overdue / outstanding aggregation on unpaid loans only
CREATE INDEX idx_loans_user_unpaid_due ON loans (user_id, due_date) WHERE is_repaid = FALSE;

-- Temporary one-time passwords. Only a keyed hash of the code is stored.
CREATE TABLE otp_requests (
  phone        TEXT PRIMARY KEY,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
