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
  /** Spotify has no active output to receive the command. */
  | 'spotify_no_device'
  /** The chosen output cannot be controlled (restricted by its owner or by Spotify). */
  | 'spotify_restricted'
  /** Controlling playback needs a Premium account. */
  | 'spotify_premium_required'
  /** The saved authorization lacks the playback-control permission: connect again. */
  | 'spotify_scope_missing'
  /** Spotify does not expose this content (for example the tracks of a playlist you do not own). */
  | 'spotify_content_unavailable'
  | 'internal_error';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  /** Human-readable, safe to display. Never contains secrets. */
  message: string;
  /** Seconds to wait before trying again (rate limiting). */
  retryAfter?: number;
}

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: ApiErrorPayload;
}
