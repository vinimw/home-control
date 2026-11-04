import type {
  AlexaCommand,
  AlexaCommandInput,
  AlexaCommandListResponse,
  AlexaExecutionResult,
  ApiErrorBody,
  ApiErrorCode,
} from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from './csrf';

export type AlexaResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiErrorCode | null; message: string };

/** pt-BR explanations. Server details are never shown, except for validation, which names the field. */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  actions_disabled: 'Os comandos estão desativados no servidor.',
  not_found: 'Esse comando não existe mais. A lista foi atualizada.',
  device_unavailable: 'O Echo está indisponível agora. Nada foi enviado.',
  unsupported_action: 'Este dispositivo não aceita comandos da Alexa.',
  invalid_params: 'Escolha um Echo válido.',
  bad_request: 'Confira o nome e o texto do comando.',
  not_configured: 'O Home Assistant não está configurado.',
  unreachable: 'Não foi possível falar com o Home Assistant.',
  disconnected: 'A conexão com o Home Assistant caiu.',
  timeout: 'O Home Assistant demorou demais para responder.',
  unauthorized: 'O Home Assistant recusou o token da API.',
  upstream_error: 'O Home Assistant não conseguiu enviar o comando à Alexa.',
  csrf_invalid: 'A solicitação foi recusada por segurança. Recarregue a página.',
  too_many_requests: 'Muitas solicitações. Aguarde um pouco.',
};
export const ALEXA_FALLBACK = 'Não foi possível concluir. Nada indica que o comando foi enviado.';

export const describeAlexaError = (code: ApiErrorCode | null | undefined): string =>
  (code && MESSAGES[code]) || ALEXA_FALLBACK;

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<AlexaResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/alexa/${path}`, {
      method,
      cache: 'no-store',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: null, message: ALEXA_FALLBACK };
  }
  if (response.status === 401) redirectToLogin();
  if (response.ok) {
    return { ok: true, data: (response.status === 204 ? null : await response.json()) as T };
  }
  const payload = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  const code = payload?.error?.code ?? null;
  return { ok: false, code, message: describeAlexaError(code) };
}

export const listAlexaCommands = () => request<AlexaCommandListResponse>('commands', 'GET');
export const createAlexaCommand = (input: AlexaCommandInput) =>
  request<AlexaCommand>('commands', 'POST', input);
export const updateAlexaCommand = (id: string, input: Partial<AlexaCommandInput>) =>
  request<AlexaCommand>(`commands/${id}`, 'PATCH', input);
export const deleteAlexaCommand = (id: string) => request<null>(`commands/${id}`, 'DELETE');

/** Sends the STORED text of a saved command. Only called from the explicit "Executar comando" button. */
export const executeAlexaCommand = (id: string) =>
  request<AlexaExecutionResult>(`commands/${id}/execute`, 'POST');

/** Sends a draft once without saving it. Only called from the explicit "Testar comando" button. */
export const testAlexaCommand = (text: string, deviceId: string) =>
  request<AlexaExecutionResult>('test', 'POST', { text, deviceId });
