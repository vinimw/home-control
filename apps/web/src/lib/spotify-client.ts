import type { ApiErrorBody, ApiErrorCode } from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from './csrf';

export type SpotifyResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiErrorCode | null; message: string };

/** pt-BR explanations for what can go wrong with Spotify. Never shows raw Spotify details. */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  not_configured: 'O Spotify ainda não foi configurado no servidor.',
  spotify_connect_required: 'Conecte sua conta do Spotify.',
  spotify_forbidden:
    'O Spotify recusou o acesso. A conta pode não estar autorizada neste app (modo de desenvolvimento) ou falta uma permissão.',
  too_many_requests: 'O Spotify está limitando as requisições. Tente de novo em instantes.',
  upstream_error: 'O Spotify está com problemas. Tente de novo mais tarde.',
  unreachable: 'Não foi possível falar com o Spotify.',
  timeout: 'O Spotify demorou demais para responder.',
  invalid_response: 'O Spotify respondeu algo que não foi possível entender.',
  csrf_invalid: 'A solicitação foi recusada por segurança. Recarregue a página.',
};
const FALLBACK = 'Não foi possível falar com o servidor.';

/** Calls this app's Spotify relay. Never throws: failures come back as an honest result. */
export async function spotifyRequest<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<SpotifyResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/spotify/${path}`, {
      method,
      cache: 'no-store',
      headers: method === 'POST' ? { 'content-type': 'application/json', ...csrfHeaders() } : {},
    });
  } catch {
    return { ok: false, code: null, message: FALLBACK };
  }
  if (response.status === 401) redirectToLogin();
  if (response.ok) {
    return { ok: true, data: (response.status === 204 ? null : await response.json()) as T };
  }
  const body = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  const code = body?.error?.code ?? null;
  return { ok: false, code, message: (code && MESSAGES[code]) || FALLBACK };
}
