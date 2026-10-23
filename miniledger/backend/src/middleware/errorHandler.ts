import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};

// Postgres connection-class errors (08xxx) and common socket errors => 503
const isDbUnavailable = (err: { code?: string }) =>
  !!err.code &&
  (err.code.startsWith('08') ||
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P03'].includes(err.code));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }
  // body-parser errors (malformed JSON, payload too large)
  if (err && typeof err === 'object' && 'type' in err) {
    const type = (err as { type: string }).type;
    if (type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    if (type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    }
  }
  // Log only the message (never the request body, headers or stack) and never leak it to clients.
  const message = err instanceof Error ? err.message : String(err);
  console.error('[error]', message);
  if (err && typeof err === 'object' && isDbUnavailable(err as { code?: string })) {
    return res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please retry.',
      },
    });
  }
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
};
