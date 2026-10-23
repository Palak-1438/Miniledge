import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

type Source = 'body' | 'params';

/** Validates req[source] with a Zod schema and replaces it with the parsed (normalized) value. */
export const validate =
  (schema: ZodTypeAny, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || source;
        if (!(key in fields)) fields[key] = issue.message;
      }
      return next(badRequest('Validation failed', { fields }));
    }
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
