# MiniLedger

MiniLedger is a small full-stack mobile app for tracking **money you have lent to friends**: who owes you, what has been repaid, and what is overdue.

- **Mobile:** React Native + Expo (TypeScript), React Navigation, Axios, Expo SecureStore, DateTimePicker
- **Backend:** Node.js + Express (TypeScript), PostgreSQL (`pg` pool), JWT, Zod, Jest + Supertest
- **Auth:** phone number + one-time password (OTP). The OTP is **mocked** — it is printed to the server console (see [Mock OTP workflow](#mock-otp-workflow)).

> **Status honesty:** the backend, database and API were built and verified end to end against a real PostgreSQL instance (see [Verification status](#verification-status)). The mobile app type-checks, lints and compiles into real Android and iOS bundles, but it has **not been run on a device or emulator** in the environment it was built in. Follow [Mobile setup](#mobile-setup) to run it.

---

## Table of contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Database initialization](#database-initialization)
6. [Backend setup](#backend-setup)
7. [Mobile setup](#mobile-setup)
8. [Environment variables](#environment-variables)
9. [Mock OTP workflow](#mock-otp-workflow)
10. [API documentation](#api-documentation)
11. [Networking: emulators and physical devices](#networking-emulators-and-physical-devices)
12. [Running tests and checks](#running-tests-and-checks)
13. [Verification status](#verification-status)
14. [Troubleshooting](#troubleshooting)
15. [Known limitations](#known-limitations)
16. [Publishing to GitHub](#publishing-to-github)

---

## Features

- Phone + OTP login, JWT session stored in the device keystore (Expo SecureStore), session restored on app start
- Dashboard with **Total Lent**, **Total Repaid**, **Overdue Amount**, Outstanding and loan count, all computed by SQL aggregation
- Loan list with repayment status, red overdue highlighting, green repaid indicators
- Add Loan screen with validation, decimal keyboard and a native date picker
- "Mark as Repaid" with a confirmation dialog; repeated repayment requests are safe (idempotent)
- Pull-to-refresh, loading / empty / error states with a Retry action
- Automatic sign-out when the token expires or is rejected
- Every loan query is scoped to the authenticated user; other users' loans are indistinguishable from nonexistent ones (404)

## Technology stack

| Layer    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Mobile   | Expo SDK 58, React Native 0.88, TypeScript, React Navigation (native stack), Axios, `expo-secure-store`, `@react-native-community/datetimepicker` |
| Backend  | Node.js 22, Express 4, TypeScript, `pg` (connection pool), `jsonwebtoken`, Zod 3, Helmet, CORS, `express-rate-limit` |
| Database | PostgreSQL 16 (SQL migrations, constraints, partial index)                |
| Testing  | Jest 29, ts-jest, Supertest (80 tests, real PostgreSQL test database)     |
| Tooling  | ESLint 9, Prettier, Docker Compose for Postgres                           |

The two packages are **separate** (`backend/` and `mobile/`, each with its own `package.json`) rather than npm workspaces, because Expo/Metro and Node tooling work most predictably when their `node_modules` are not hoisted together.

## Architecture

```
miniledger/
├── backend/
│   ├── migrations/001_init.sql       # users, loans, otp_requests + constraints + indexes
│   ├── scripts/acceptance.ts         # real end-to-end HTTP + DB acceptance check
│   ├── src/
│   │   ├── config/env.ts             # Zod-validated env; refuses weak/missing JWT_SECRET
│   │   ├── db/{pool,migrate}.ts      # pg Pool, transactions, tiny migration runner
│   │   ├── middleware/               # auth (JWT), validate (Zod), errorHandler
│   │   ├── modules/auth/             # routes -> schemas (Zod) -> service (OTP + JWT)
│   │   ├── modules/loans/            # routes -> schemas (Zod) -> service (SQL)
│   │   ├── utils/                    # AppError, phone normalizer, date validator
│   │   ├── app.ts                    # createApp() (no listen; testable with Supertest)
│   │   └── server.ts                 # connects, migrates, listens, graceful shutdown
│   └── tests/                        # Jest + Supertest
├── mobile/
│   ├── App.tsx
│   └── src/
│       ├── api/                      # axios client (+interceptors), auth + loans calls
│       ├── components/               # Button, TextField, Banner, SummaryCard, LoanCard
│       ├── hooks/                    # useAuth (session), useLoans (data loading)
│       ├── navigation/RootNavigator  # which screens exist for signed-in / signed-out
│       ├── screens/                  # Login, Dashboard, AddLoan
│       ├── types/                    # API types + typed navigation params
│       └── utils/                    # validation, formatting, SecureStore session
├── docker-compose.yml
├── docker/init-test-db.sh
└── .env.example
```

Design decisions worth explaining in an interview:

- **Routes → schemas → service.** Routes only wire HTTP; Zod schemas validate and normalize input; services own SQL and business rules. Navigation on the mobile side is likewise separated from business logic (screens call hooks/API modules; the navigator only picks screens by auth status).
- **Money is never a float.** Amounts are `NUMERIC(12,2)` in Postgres, travel as strings in JSON (`"1250.50"`), and are validated with a regex (`^\d{1,10}(\.\d{1,2})?$`) rather than parsed into floating point.
- **Date/timezone policy.** `due_date` is a PostgreSQL `DATE` (no time zone). "Today" is `(NOW() AT TIME ZONE APP_TIMEZONE)::date` (default `Asia/Kolkata`, configurable). A loan is **overdue** when it is unpaid **and** `due_date < today`; a loan due today is not overdue until tomorrow. Overdue is computed in SQL for both the list and the summary, so they can never disagree.
- **Authorization by construction.** Every loan query includes `AND user_id = $n` using the ID from the verified JWT. Access to another user's loan returns `404`, not `403`, so IDs can't be probed.
- **Idempotency.** `PATCH /loans/:id/repay` uses `UPDATE … WHERE is_repaid = FALSE`; a repeat returns `200` with `alreadyRepaid: true` and leaves the original `repaid_at` untouched. `POST /loans` takes an advisory lock and returns the existing loan for an identical submission from the same user within 10 seconds (the double-tap guard). The mobile app additionally blocks double taps with a synchronous ref guard and disabled buttons.
- **Route-level session protection on mobile.** Private screens are not registered in the navigator while signed out, so they cannot be reached by back-navigation or deep links. An authenticated request answered with `401` (`TOKEN_EXPIRED`/`INVALID_TOKEN`) clears the session and returns the user to Login.

## Prerequisites

- **Node.js 20+** (developed on 22) and npm
- **PostgreSQL 14+** — either Docker (recommended) or a native install
- **Expo Go** on your phone (iOS App Store / Google Play), or an Android emulator / iOS simulator

## Database initialization

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env: set JWT_SECRET (see below). POSTGRES_* defaults are fine for local dev.
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` with the `miniledger` database, and (on first start) a separate `miniledger_test` database used only by automated tests.

### Option B — an existing/native PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER miniledger WITH PASSWORD 'miniledger_dev_pw';
CREATE DATABASE miniledger OWNER miniledger;
CREATE DATABASE miniledger_test OWNER miniledger;
SQL
```

Use a different password in real use and put the same value in `DATABASE_URL`.

### Applying the schema

The schema lives in `backend/migrations/*.sql` and is applied by a tiny migration runner that records applied files in `schema_migrations` (safe to run repeatedly). It runs automatically when the server starts, and can be run explicitly:

```bash
cd backend && npm run migrate
```

Tables: `users`, `loans` (with CHECK constraints for positive amount, non-blank name, and `repaid_at` consistency; indexes on `(user_id, created_at DESC)` and a partial index on unpaid loans), `otp_requests`, `schema_migrations`.

## Backend setup

```bash
cd backend
npm install

# from the repo root, create .env and generate a real secret:
cd .. && cp .env.example .env
sed -i "s/^JWT_SECRET=$/JWT_SECRET=$(openssl rand -hex 48)/" .env   # macOS: sed -i '' ...
cd backend

npm run migrate     # optional (server also migrates on start)
npm run dev         # http://localhost:4000, auto-restarts on changes
```

The server **refuses to start** if `JWT_SECRET` is missing, shorter than 32 characters, or looks like a placeholder. For a production-style run: `npm run build && npm start`.

Check it: `curl localhost:4000/health` → `{"status":"ok","database":"up"}`.

## Mobile setup

```bash
cd mobile
npm install
npx expo start
```

Then press `a` (Android emulator), `i` (iOS simulator), or scan the QR code with Expo Go on a phone **on the same Wi-Fi network as your computer**.

By default the app discovers the backend automatically (see [Networking](#networking-emulators-and-physical-devices)). To set it explicitly:

```bash
cd mobile
cp .env.example .env     # then set EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000
npx expo start -c
```

> Android note: Expo Go allows plain `http://` to your LAN. A standalone/dev-client build on Android 9+ blocks cleartext HTTP unless you enable it (`expo-build-properties` → `android.usesCleartextTraffic: true`) or use an `https://` URL.

## Environment variables

Backend (`.env` in the repo root or in `backend/`; real environment variables always win):

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | — (required) | ≥ 32 random chars, not a placeholder. `openssl rand -hex 48` |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime (`15m`, `12h`, `7d`…) |
| `PORT` | `4000` | HTTP port (binds `0.0.0.0` so phones can connect) |
| `NODE_ENV` | `development` | `production` disables console OTP printing |
| `OTP_TTL_SECONDS` | `300` | OTP validity |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong guesses before the OTP is locked |
| `OTP_RESEND_COOLDOWN_SECONDS` | `30` | Minimum gap between OTP requests per phone |
| `APP_TIMEZONE` | `Asia/Kolkata` | IANA zone that defines "today" for overdue logic |
| `RATE_LIMIT_ENABLED` | `true` | 50 requests / 15 min / IP on `/auth/*` |
| `DB_POOL_MAX` | `10` | pg pool size |
| `TEST_DATABASE_URL` | local `miniledger_test` | Used by `npm test`; **database name must contain `test`** |
| `POSTGRES_USER/PASSWORD/DB` | — | Used only by `docker-compose.yml` |

Mobile (`mobile/.env`): `EXPO_PUBLIC_API_URL` (optional; overrides auto-discovery).

Secrets are never committed: `.env` is git-ignored, only `.env.example` (with an empty `JWT_SECRET`) is tracked.

## Mock OTP workflow

> ⚠️ **Development only. This is not production-grade authentication.** There is no SMS provider. Anyone with access to the server console can read OTPs.

1. In the app enter a phone number with country code (e.g. `+91` `98765 43210`) and tap **Request OTP**.
2. The server creates a random 6-digit code, stores only a keyed hash (HMAC-SHA256) with an expiry, and **prints the code to the server console**:
   ```
   [DEV OTP] +919876543210 -> 482915 (valid 300s)
   ```
   The API response never contains the code.
3. Type that code into the app and tap **Verify OTP**. The server checks expiry, attempt count (default max 5) and the hash, burns the OTP so it can't be reused, creates the user if needed, and returns a signed JWT.
4. The app stores the JWT in Expo SecureStore and opens the Dashboard.

To replace the mock for production you would swap the `console.log` in `auth.service.ts` for an SMS provider call (e.g. Twilio Verify) and add per-IP/per-phone throttling beyond the basic limits here.

## API documentation

Base URL: `http://localhost:4000`. JSON in/out. Private endpoints need `Authorization: Bearer <token>`.

**Error format (all endpoints):**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": { "fields": { "amount": "Amount can have at most 2 decimal places" } } } }
```

Common codes: `VALIDATION_ERROR` (400), `INVALID_JSON` (400), `UNAUTHORIZED` / `INVALID_TOKEN` / `TOKEN_EXPIRED` / `INVALID_OTP` / `OTP_EXPIRED` (401), `NOT_FOUND` (404), `OTP_RESEND_TOO_SOON` / `OTP_ATTEMPTS_EXCEEDED` / `RATE_LIMITED` (429), `INTERNAL_ERROR` (500, generic message, no internals), `SERVICE_UNAVAILABLE` (503, database unreachable).

### `GET /health`
`200 {"status":"ok","database":"up"}` — or `503 {"status":"degraded","database":"down"}`.

### `POST /auth/request-otp`
```bash
curl -X POST localhost:4000/auth/request-otp -H 'content-type: application/json' \
  -d '{"phone":"+91 98765 43210"}'
```
`200` → `{"message":"OTP requested","expiresInSeconds":300}` (the phone is normalized to E.164: `+919876543210`).
`400` invalid phone · `429` requested again within the cooldown.

### `POST /auth/verify-otp`
```bash
curl -X POST localhost:4000/auth/verify-otp -H 'content-type: application/json' \
  -d '{"phone":"+919876543210","otp":"482915"}'
```
`200` → `{"token":"<jwt>","user":{"id":"<uuid>","phone":"+919876543210"}}`
`401` wrong/expired/used OTP · `429` attempt limit reached (request a new OTP).

### `POST /loans` 🔒
```bash
curl -X POST localhost:4000/loans -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"friendName":"Rahul Sharma","amount":"1500.50","dueDate":"2026-11-02"}'
```
`201` →
```json
{ "loan": { "id": "…", "friendName": "Rahul Sharma", "amount": "1500.50", "dueDate": "2026-11-02",
            "isRepaid": false, "repaidAt": null, "createdAt": "2026-10-23T05:54:58.378Z", "isOverdue": false },
  "duplicate": false }
```
Rules: `friendName` trimmed, 1–100 chars; `amount` > 0, ≤ 2 decimals, ≤ 10 integer digits (string or number); `dueDate` real `YYYY-MM-DD` date; unknown fields are rejected. An identical submission by the same user within 10 s returns `200` with `"duplicate": true` and the existing loan.

### `GET /loans` 🔒
`200 {"loans":[…]}` — only the caller's loans; unpaid first, soonest due date first (max 500).

### `GET /loans/:id` 🔒
`200 {"loan":{…}}` · `400` if `:id` is not a UUID · `404` if it doesn't exist **or belongs to someone else**.

### `PATCH /loans/:id/repay` 🔒
`200 {"loan":{…,"isRepaid":true,"repaidAt":"…"},"alreadyRepaid":false}`. Calling it again returns `200` with `"alreadyRepaid": true` and the original `repaidAt`.

### `GET /loans/summary` 🔒
```json
{ "summary": { "totalLent": "2750.49", "totalRepaid": "2500.49", "outstandingAmount": "250.00",
               "overdueAmount": "250.00", "totalLoans": 3 } }
```
`overdueAmount` sums only **unpaid** loans with `due_date` before today (in `APP_TIMEZONE`). All amounts are strings with two decimals.

## Networking: emulators and physical devices

`localhost` on a phone refers to **the phone**, not your computer. The backend listens on `0.0.0.0:4000` so other devices can reach it.

| Where the app runs | URL that works | Notes |
| --- | --- | --- |
| iOS simulator | `http://localhost:4000` | Shares the Mac's network |
| Android emulator | `http://10.0.2.2:4000` | `10.0.2.2` is the emulator's alias for the host's loopback |
| Physical phone (Expo Go) | `http://<computer-LAN-IP>:4000` | Same Wi-Fi; find the IP with `ipconfig` (Windows), `ipconfig getifaddr en0` (macOS), or `hostname -I` (Linux) |
| Phone on another network | an `https://` tunnel (ngrok, Cloudflare Tunnel) or a deployed URL | Set `EXPO_PUBLIC_API_URL` |

Resolution order (`mobile/src/config.ts`): `EXPO_PUBLIC_API_URL` → the Expo dev server's host IP (so a phone on the same Wi-Fi works with no configuration) → `10.0.2.2` on Android / `localhost` on iOS. If the app can't connect, the error message shows the URL it tried.

Make sure your computer's firewall allows inbound connections on port 4000 (Windows Defender Firewall commonly blocks Node on first run).

## Running tests and checks

Backend tests use a **separate database** (`miniledger_test`). The test setup refuses to run, and refuses to truncate anything, unless the database name contains `test`, and it overrides `DATABASE_URL`, so your development data is never touched.

```bash
cd backend
npm test              # 80 tests: OTP, auth, validation, ownership, repay, summary, overdue, errors
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run check         # typecheck + lint + tests

cd ../mobile
npm run typecheck
npm run lint
npm run format:check
npm run bundle:check  # full Metro bundle for Android (catches import/syntax errors)
```

### End-to-end acceptance script (real server + real DB)

With the backend running and its log redirected to a file (so the script can read the OTP exactly as a developer would):

```bash
cd backend && npm run build
node dist/server.js > /tmp/backend.log 2>&1 &
BASE_URL=http://localhost:4000 LOG_FILE=/tmp/backend.log npm run acceptance
# stop and restart the server, wait 30 s (OTP resend cooldown), then:
PHASE=after-restart LOG_FILE=/tmp/backend.log npm run acceptance
```

It performs the same HTTP calls the three screens make (login, create loan, repay, overdue, second user, unauthenticated access), checks the rows directly in PostgreSQL, and cleans up its own `+1555000100x` users.

## Verification status

What was **actually executed** while building this project:

| Check | Result |
| --- | --- |
| PostgreSQL 16 running; migration applied to `miniledger` and `miniledger_test` | ✅ |
| `backend`: `tsc --noEmit`, `eslint`, `prettier --check`, `npm run build` | ✅ clean |
| `backend`: `npm test` (Jest + Supertest, real Postgres test DB) | ✅ 80 / 80 passed |
| `backend`: `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Server refuses to start with missing / short / placeholder `JWT_SECRET` | ✅ |
| E2E acceptance script against the live server + dev DB (login via OTP read from the server log, create, persist, summary, repay, repeat repay, overdue, second-user isolation, 401s without token) | ✅ all checks passed |
| Backend restarted; all loans and summary values identical afterwards | ✅ |
| `mobile`: `tsc --noEmit`, `eslint`, `prettier --check` | ✅ clean |
| `mobile`: `expo export` for **Android** and **iOS** (full Metro/Hermes bundle) | ✅ |
| Mobile app launched on an emulator/simulator/phone and tapped through | ❌ **not possible in the build environment** |
| Docker Compose | ❌ Docker was unavailable there; the compose file is provided but **untested**. Native PostgreSQL 16 was used instead |

So the three screens are fully implemented and wired to the real API, and the exact API calls they make are verified, but the on-device UI flow itself still needs one manual pass by you (steps below).

### Manual on-device acceptance checklist

1. `docker compose up -d` (or native Postgres), start the backend (`npm run dev`), start the app (`npx expo start`).
2. Login screen → enter phone → **Request OTP** → read the code from the backend terminal → enter it → **Verify OTP** → Dashboard appears.
3. **+ Add Loan** → name `Rahul`, amount `1500.50`, pick a date → **Save Loan** → back on the Dashboard with the new card and a success banner; totals updated.
4. Check Postgres: `psql "$DATABASE_URL" -c "select friend_name, amount, due_date, is_repaid from loans;"`.
5. **Mark as Repaid** → confirm → card turns green, Total Repaid increases, Outstanding decreases.
6. Add a loan with a past due date → red "Overdue" card; Overdue Amount increases.
7. Log out; log in with a second phone number → empty dashboard (no access to the first user's data).
8. Stop and restart the backend; pull to refresh → data still there.
9. Log out → protected API calls without a token return `401`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration: JWT_SECRET …` | Set a random `JWT_SECRET` of ≥ 32 chars in `.env` |
| `ECONNREFUSED 127.0.0.1:5432` on startup | PostgreSQL isn't running: `docker compose up -d` / `sudo service postgresql start` |
| `password authentication failed` | `DATABASE_URL` credentials don't match the DB user; with Docker, remove the old volume after changing the password (`docker compose down -v`) |
| App shows "Can't reach the server at …" | Wrong URL for your device (see [Networking](#networking-emulators-and-physical-devices)), backend not running, phone on a different network, or firewall blocking port 4000. Test from the phone's browser: `http://<ip>:4000/health` |
| Changed `EXPO_PUBLIC_API_URL` but nothing changed | Restart with a cleared cache: `npx expo start -c` |
| `429 OTP_RESEND_TOO_SOON` | Wait for the 30 s cooldown (the Login screen shows a countdown) |
| `429 OTP_ATTEMPTS_EXCEEDED` | Request a fresh OTP |
| Can't find the OTP | It's printed in the **backend** terminal (`[DEV OTP] …`), not in Expo's. In `production` mode it is not printed |
| Tests refuse to run: "does not contain test" | Point `TEST_DATABASE_URL` at a database whose name contains `test` |
| `Port 4000 already in use` | Change `PORT` (and `EXPO_PUBLIC_API_URL`) or stop the other process |
| Android build can't reach `http://` | Cleartext HTTP is blocked in standalone builds; use Expo Go, enable cleartext, or use HTTPS |

## Known limitations

- **Mock OTP** (console-printed) is for development only; no SMS delivery, no device binding, no refresh tokens. The JWT is a single 7-day access token and logout is client-side only (no server-side revocation list).
- No loan editing or deletion, partial repayments, interest, reminders/push notifications, or multiple currencies (amounts display as ₹).
- `GET /loans` returns at most 500 loans and has no pagination.
- Rate limiting is in-memory and per-process (not shared across multiple server instances).
- Overdue is evaluated in one configured time zone for all users.
- The mobile app has no automated UI tests; it is verified by type-check, lint, bundling and the manual checklist above.
- Docker Compose configuration was not executed in the build environment.

## Publishing to GitHub

1. Create an empty repository on GitHub (no README/license), e.g. `miniledger`.
2. Confirm no secrets are tracked: `git status` must not list `.env`, and `git ls-files | grep -i '\.env'` should show only `.env.example` files.
3. From the repo root:
   ```bash
   git init                      # skip if already initialized
   git add .
   git commit -m "MiniLedger MVP: Express/PostgreSQL API and Expo mobile app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/miniledger.git
   git push -u origin main
   ```
4. Add the repository URL and your demo recording link to your submission. See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for a 2–3 minute recording script.
