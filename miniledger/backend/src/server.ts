import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { runMigrations } from './db/migrate';

async function main() {
  await pool.query('SELECT 1'); // fail fast if the database is unreachable
  const applied = await runMigrations();
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(
      `MiniLedger API listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV}, tz=${env.APP_TIMEZONE})`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
