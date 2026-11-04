import { cookies } from 'next/headers';
import { API_AUTH_PATH, type AuthSessionResponse } from '@home-control/shared';
import { env } from './env';

/** Cookie header of the current request, to speak to the API as the same user. */
export async function cookieHeader(): Promise<Record<string, string>> {
  const value = (await cookies()).toString();
  return value ? { cookie: value } : {};
}

/**
 * Server-side: who is asking. Returns `null` only when the API cannot be reached, which callers must treat
 * as "cannot verify" and never as "authenticated".
 */
export async function getSession(): Promise<AuthSessionResponse | null> {
  try {
    const response = await fetch(`${env.API_INTERNAL_URL}${API_AUTH_PATH}/session`, {
      cache: 'no-store',
      headers: await cookieHeader(),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? ((await response.json()) as AuthSessionResponse) : null;
  } catch {
    return null;
  }
}
