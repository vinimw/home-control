/**
 * The session's CSRF token, held in memory only (never in storage). The server hands it to the page when
 * it renders; every state-changing request sends it back in a header.
 */
let token: string | null = null;

export function setCsrfToken(value: string | null): void {
  token = value;
}

export function csrfHeaders(): Record<string, string> {
  return token ? { 'x-csrf-token': token } : {};
}

/** The session ended (expired, logged out elsewhere): go back to the login screen. */
export function redirectToLogin(): void {
  if (typeof window !== 'undefined') window.location.assign('/login');
}
