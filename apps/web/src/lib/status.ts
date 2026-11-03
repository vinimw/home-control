import type { HomeAssistantStatusResponse } from '@home-control/shared';

export type Tone = 'success' | 'warning' | 'danger' | 'muted';

export interface StatusView {
  label: string;
  tone: Tone;
  detail?: string;
}

/** Human (pt-BR) description of the Home Assistant integration. `null` = API unreachable. */
export function describeHomeAssistant(status: HomeAssistantStatusResponse | null): StatusView {
  if (!status) return { label: 'Desconhecido', tone: 'muted', detail: 'A API não respondeu.' };
  if (!status.configured) {
    return {
      label: 'Não configurado',
      tone: 'muted',
      detail: 'Defina HOME_ASSISTANT_URL e HOME_ASSISTANT_TOKEN no servidor.',
    };
  }

  const { state, lastError } = status.realtime;
  if (status.healthy) return { label: 'Conectado', tone: 'success' };
  if (state === 'failed' && lastError?.code === 'unauthorized') {
    return {
      label: 'Token recusado',
      tone: 'danger',
      detail: 'Gere um novo token no Home Assistant.',
    };
  }
  if (state === 'failed') return { label: 'Falha', tone: 'danger', detail: lastError?.message };
  if (state === 'stopped' || state === 'idle') return { label: 'Parado', tone: 'muted' };
  // Connecting / authenticating / reconnecting, or REST failing while the socket is up.
  return {
    label: state === 'connected' ? 'Instável' : 'Reconectando…',
    tone: 'warning',
    detail: status.rest.error?.message ?? lastError?.message,
  };
}
