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
  | 'unsupported_action'
  | 'invalid_params'
  | 'device_unavailable'
  | 'actions_disabled'
  | 'conflict'
  | 'too_many_requests'
  /** No valid session. */
  | 'auth_required'
  /** Wrong password or setup code. Deliberately says nothing more. */
  | 'invalid_credentials'
  /** A state-changing request without a valid CSRF token or from another origin. */
  | 'csrf_invalid'
  /** Login attempted before the first-run setup. */
  | 'setup_required'
  /** The Spotify account is not connected (or must be connected again). */
  | 'spotify_connect_required'
  /** Spotify refused the request (for example the account is not allowed to use this app). */
  | 'spotify_forbidden'
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
