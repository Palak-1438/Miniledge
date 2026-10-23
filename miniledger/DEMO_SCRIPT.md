# MiniLedger — 2–3 minute demo recording script

**Setup before recording (not on camera):** Postgres running, backend started with `npm run dev` in a terminal you can show, Expo app running on a phone/emulator, a clean database (or fresh phone numbers). Use a screen recorder that captures both the phone/emulator and the backend terminal side by side.

| Time | Show | Say (suggested) |
| --- | --- | --- |
| 0:00–0:15 | Title/Login screen | "This is MiniLedger, a mobile app for tracking money I've lent to friends. It's React Native with Expo, backed by an Express API and PostgreSQL." |
| 0:15–0:40 | Enter `+91` and a phone number → **Request OTP**. Switch to the backend terminal and point at `[DEV OTP] …` | "Login uses a phone number and OTP. There's no SMS provider in this MVP, so the server prints the OTP to its console. The API response never contains it, and the OTP is stored hashed with an expiry and an attempt limit." |
| 0:40–0:55 | Type the OTP → **Verify OTP** → Dashboard appears | "The server returns a signed JWT, which the app keeps in the device's secure storage. Restarting the app restores the session." |
| 0:55–1:10 | Empty Dashboard: summary cards at zero, empty state | "The dashboard is fully driven by the API — totals come from SQL aggregation, nothing is hardcoded." |
| 1:10–1:45 | **+ Add Loan**: submit empty (show validation) → name `Rahul`, amount `1500.505` (show 2-decimal error) → fix to `1500.50`, pick a date 10 days out → **Save Loan** | "Validation runs on the phone and again on the server. Amounts are exact decimals, never floats. After saving I land back on the dashboard with a confirmation, and the loan and totals are already updated." |
| 1:45–2:05 | Add a second loan with a **past due date** → red Overdue card; point at Overdue Amount | "Anything unpaid past its due date is flagged overdue, in the list and in the summary, using one date rule in SQL." |
| 2:05–2:25 | Tap **Mark as Repaid** on one → confirmation dialog → confirm → green status, totals change | "Repayment asks for confirmation. The endpoint is idempotent, so a double tap or retry can't corrupt the data." |
| 2:25–2:40 | (Optional) terminal: `psql … -c "select friend_name, amount, is_repaid from loans;"` | "And here's the data actually persisted in PostgreSQL." |
| 2:40–3:00 | Logout → log in as a different number → empty dashboard. Then show `npm test` output (80 passing) | "Each user only ever sees their own loans — another user's loan ID returns 404. The backend has 80 automated tests running against a separate test database." |

**Tips:** keep the backend terminal visible for the OTP step; if you hit the 30 s OTP resend cooldown while re-recording, wait for the countdown shown on the Login screen; do not show `.env` on camera.
