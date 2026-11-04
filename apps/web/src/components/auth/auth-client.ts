import type { ApiErrorBody, ApiErrorCode } from '@home-control/shared';
import { csrfHeaders } from '@/lib/csrf';
import { describeError } from '@/lib/messages';

export type AuthResult = { ok: true } | { ok: false; code: ApiErrorCode | null; message: string };

/** Calls an auth endpoint on this app's relay. Never throws; the message is ready for the user. */
export async function postAuth(
  action: 'login' | 'setup' | 'logout' | 'password',
  body?: unknown,
): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: null, message: 'Não foi possível falar com o servidor.' };
  }
  if (response.ok) return { ok: true };

  const payload = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  const code = payload?.error?.code ?? null;
  if (code === 'too_many_requests') {
    const wait = Number(response.headers.get('retry-after'));
    return {
      ok: false,
      code,
      message:
        wait > 0
          ? `Muitas tentativas. Tente de novo em ${wait} segundos.`
          : describeError(code ?? undefined),
    };
  }
  if (code === 'invalid_params') {
    // The API names the rule (e.g. password length) and never the value.
    return { ok: false, code, message: payload?.error?.message ?? describeError(undefined) };
  }
  return { ok: false, code, message: describeError(code ?? undefined) };
}
