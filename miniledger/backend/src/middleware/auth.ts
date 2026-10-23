import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/errors';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !/^Bearer\s+\S+$/i.test(header)) {
    return next(unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.split(/\s+/)[1] as string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return next(unauthorized('Invalid token', 'INVALID_TOKEN'));
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(unauthorized('Session expired. Please log in again.', 'TOKEN_EXPIRED'));
    }
    next(unauthorized('Invalid token', 'INVALID_TOKEN'));
  }
};
