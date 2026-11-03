import type { ApiErrorCode, ApiErrorPayload } from '@home-control/shared';

/** Error with a stable code, safe to serialize to API clients. */
export class HomeAssistantError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'HomeAssistantError';
  }

  toPayload(): ApiErrorPayload {
    return { code: this.code, message: this.message };
  }
}

/** HTTP status the API uses for each error code. */
export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  not_configured: 503,
  disconnected: 503,
  unauthorized: 502, // Home Assistant rejected OUR token; not the browser's credentials.
  unreachable: 502,
  upstream_error: 502,
  invalid_response: 502,
  timeout: 504,
  not_found: 404,
  bad_request: 400,
  internal_error: 500,
};

export function toErrorPayload(error: unknown): ApiErrorPayload {
  if (error instanceof HomeAssistantError) return error.toPayload();
  return { code: 'internal_error', message: 'Internal server error' };
}
