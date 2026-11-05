import type { ApiErrorBody, ApiErrorCode } from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from './csrf';

export type SpotifyResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ApiErrorCode | null; message: string; retryAfter?: number };

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
  unsupported_action: 'O Spotify não aceita este comando agora. Inicie a reprodução em uma saída.',
  device_unavailable: 'Essa saída não está disponível no Spotify agora.',
  not_found: 'O player do Spotify não foi encontrado no Home Assistant.',
  disconnected: 'Sem conexão em tempo real com o Home Assistant.',
  invalid_params: 'Confira o Client ID e o callback informados.',
  spotify_no_device:
    'Nenhuma saída ativa no Spotify. Abra o Spotify em um aparelho ou escolha uma saída da lista.',
  spotify_restricted: 'O Spotify não permite controlar essa saída agora.',
  spotify_premium_required: 'O Spotify só permite controlar a reprodução com Premium.',
  spotify_scope_missing:
    'Falta a permissão de controle. Em Ajustes > Spotify, use "Conectar de novo" e aceite todas as permissões.',
  spotify_content_unavailable:
    'O Spotify só compartilha as faixas de playlists que você criou ou em que colabora.',
  conflict: 'Outro comando do Spotify ainda está em andamento.',
  csrf_invalid: 'A solicitação foi recusada por segurança. Recarregue a página.',
};
const FALLBACK = 'Não foi possível falar com o servidor.';

/** Calls this app's Spotify relay. Never throws: failures come back as an honest result. */
export async function spotifyRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  payload?: unknown,
): Promise<SpotifyResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/spotify/${path}`, {
      method,
      cache: 'no-store',
      headers: method !== 'GET' ? { 'content-type': 'application/json', ...csrfHeaders() } : {},
      body: payload === undefined ? undefined : JSON.stringify(payload),
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
  const retryAfter = body?.error?.retryAfter;
  return {
    ok: false,
    code,
    message: (code && MESSAGES[code]) || FALLBACK,
    ...(typeof retryAfter === 'number' ? { retryAfter } : {}),
  };
}
