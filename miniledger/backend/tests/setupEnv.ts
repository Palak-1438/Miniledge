// Runs before any module is imported. Forces an isolated test configuration.
const testUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://miniledger:miniledger_dev_pw@localhost:5432/miniledger_test';

const dbName = new URL(testUrl).pathname.replace('/', '');
if (!dbName.includes('test')) {
  throw new Error(
    `Refusing to run tests: database "${dbName}" does not contain "test" in its name.`,
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl; // overrides any dev DATABASE_URL, so dev data is never touched
process.env.JWT_SECRET = 'jest-only-key-0123456789abcdef0123456789abcdef';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.OTP_MAX_ATTEMPTS = '5';
process.env.OTP_TTL_SECONDS = '300';
process.env.APP_TIMEZONE = 'Asia/Kolkata';
