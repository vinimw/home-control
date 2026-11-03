import type { ApiErrorCode } from '@home-control/shared';
import { ApiError } from '../errors.js';

export { HTTP_STATUS_BY_CODE, toErrorPayload } from '../errors.js';

/** Failure talking to Home Assistant. */
export class HomeAssistantError extends ApiError {
  constructor(code: ApiErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(code, message, options);
    this.name = 'HomeAssistantError';
  }
}
