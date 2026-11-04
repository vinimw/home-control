/**
 * Single-user authentication contracts.
 *
 * The browser only talks to the web app (same origin). The session lives in an HttpOnly cookie that the
 * browser never reads; state-changing requests also carry the session's CSRF token in a header.
 */

export const API_AUTH_PATH = '/auth';

/** Name of the HttpOnly session cookie. */
export const SESSION_COOKIE = 'hc_session';
/** Header carrying the CSRF token on every state-changing request. */
export const CSRF_HEADER = 'x-csrf-token';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** `GET /auth/session` (public). Tells a client what to show without revealing anything sensitive. */
export interface AuthSessionResponse {
  /** A password has been created. When false, the first-run setup is required. */
  configured: boolean;
  authenticated: boolean;
  /** Present only for an authenticated session. Send it back in the `x-csrf-token` header. */
  csrfToken: string | null;
}

/** `POST /auth/setup`: first-run password creation, authorized by the one-time code printed in the API log. */
export interface AuthSetupRequest {
  setupCode: string;
  password: string;
}

/** `POST /auth/login` */
export interface AuthLoginRequest {
  password: string;
}

/** `POST /auth/password` (requires a session). Ends every other session. */
export interface AuthChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
