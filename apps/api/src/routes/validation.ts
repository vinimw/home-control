import type { ZodType } from 'zod';
import { ApiError } from '../errors.js';

/** Parses a request part strictly; the error names the offending fields but never echoes values. */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown, what: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) =>
    issue.code === 'unrecognized_keys'
      ? `unexpected field(s): ${issue.keys.join(', ')}`
      : `${issue.path.join('.') || what}: ${issue.message}`,
  );
  throw new ApiError('bad_request', `Invalid ${what}: ${problems.join('; ')}`);
}
