import { z } from 'zod';
import type { CommandParam, DeviceCommand } from '@home-control/shared';
import { ApiError } from '../../errors.js';

function paramSchema(param: CommandParam): z.ZodType {
  switch (param.type) {
    case 'number': {
      let schema = z.number({ message: 'must be a number' });
      const { min, max } = param;
      if (min !== undefined) schema = schema.min(min, { message: `must be at least ${min}` });
      if (max !== undefined) schema = schema.max(max, { message: `must be at most ${max}` });
      return schema;
    }
    case 'boolean':
      return z.boolean({ message: 'must be a boolean' });
    case 'string': {
      const options = param.options ?? [];
      // An allowlist when the device published one; otherwise any bounded string.
      return options.length > 0
        ? z.string().refine((value) => options.includes(value), {
            message: `must be one of: ${options.join(', ')}`,
          })
        : z.string({ message: 'must be a string' }).min(1).max(100);
    }
  }
}

/**
 * Validates `params` against the command spec the device itself advertises:
 * every declared param is required and has the right type/range/options, and any extra key is rejected.
 * Error messages never echo the submitted values.
 */
export function validateParams(command: DeviceCommand, params: unknown): Record<string, unknown> {
  const shape = Object.fromEntries(command.params.map((p) => [p.name, paramSchema(p)]));
  const result = z
    .object(shape)
    .strict()
    .safeParse(params ?? {});

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      if (issue.code === 'unrecognized_keys')
        return `unexpected param(s): ${issue.keys.join(', ')}`;
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    throw new ApiError(
      'invalid_params',
      `Invalid params for "${command.name}": ${problems.join('; ')}`,
    );
  }
  return result.data as Record<string, unknown>;
}
