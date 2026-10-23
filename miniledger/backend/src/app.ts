import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { checkDb } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { loansRouter } from './modules/loans/loans.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', async (_req, res) => {
    const db = await checkDb();
    res
      .status(db ? 200 : 503)
      .json({ status: db ? 'ok' : 'degraded', database: db ? 'up' : 'down' });
  });

  if (env.RATE_LIMIT_ENABLED) {
    app.use(
      '/auth',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 50,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
        },
      }),
    );
  }

  app.use('/auth', authRouter);
  app.use('/loans', loansRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
