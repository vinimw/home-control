import type { ApiErrorCode } from '@home-control/shared';

/** User-facing (pt-BR) explanations for API error codes. Never shows raw provider details. */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  unsupported_action: 'Este dispositivo não suporta essa ação.',
  invalid_params: 'O valor enviado não é válido para este dispositivo.',
  device_unavailable: 'O dispositivo está indisponível.',
  actions_disabled: 'As ações estão desativadas no servidor.',
  not_configured: 'O Home Assistant não está configurado.',
  disconnected: 'A conexão com o Home Assistant caiu.',
  unreachable: 'Não foi possível falar com o Home Assistant.',
  timeout: 'O dispositivo demorou demais para responder.',
  unauthorized: 'O Home Assistant recusou o token da API.',
  conflict: 'Esta solicitação conflita com uma anterior.',
  not_found: 'Dispositivo não encontrado.',
  auth_required: 'Sua sessão terminou. Entre de novo.',
  invalid_credentials: 'Senha incorreta.',
  csrf_invalid: 'A solicitação foi recusada por segurança. Recarregue a página.',
  too_many_requests: 'Muitas tentativas. Aguarde um pouco.',
  setup_required: 'Crie a senha antes de entrar.',
};

export const FALLBACK_ERROR = 'Não foi possível executar a ação.';

export function describeError(code: ApiErrorCode | undefined): string {
  return (code && MESSAGES[code]) || FALLBACK_ERROR;
}
