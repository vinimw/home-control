/** Machine-readable error codes returned by the API. */
export type ApiErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'unreachable'
  | 'timeout'
  | 'not_found'
  | 'bad_request'
  | 'upstream_error'
  | 'invalid_response'
  | 'disconnected'
  | 'internal_error';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  /** Human-readable, safe to display. Never contains secrets. */
  message: string;
}

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: ApiErrorPayload;
}
