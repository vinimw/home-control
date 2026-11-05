import type { SceneRunStatus, SceneStep } from '@home-control/shared';
import type { DeviceActionStatus } from '@home-control/shared';

const COMMAND_LABELS: Record<string, string> = {
  turn_on: 'Ligar',
  turn_off: 'Desligar',
  toggle: 'Alternar',
  play: 'Tocar',
  pause: 'Pausar',
  stop: 'Parar',
  previous_track: 'Faixa anterior',
  next_track: 'Próxima faixa',
  set_volume: 'Ajustar volume',
  volume_up: 'Aumentar volume',
  volume_down: 'Diminuir volume',
  set_mute: 'Silenciar / reativar som',
  select_source: 'Escolher fonte',
  press_key: 'Pressionar tecla',
  set_brightness: 'Ajustar brilho',
  activate: 'Ativar',
};

export const commandLabel = (name: string): string =>
  COMMAND_LABELS[name] ?? name.replace(/_/g, ' ');

export const RUN_STATUS: Record<
  SceneRunStatus,
  { label: string; variant: 'success' | 'warning' | 'danger'; text: string }
> = {
  confirmed: {
    label: 'Confirmada',
    variant: 'success',
    text: 'Todos os passos foram confirmados.',
  },
  accepted: {
    label: 'Aceita',
    variant: 'warning',
    text: 'Nenhum passo falhou, mas nem todos foram confirmados ainda.',
  },
  partial: {
    label: 'Parcial',
    variant: 'warning',
    text: 'Alguns passos funcionaram e outros falharam.',
  },
  failed: { label: 'Falhou', variant: 'danger', text: 'Nenhum passo funcionou.' },
};

export const STEP_STATUS: Record<
  DeviceActionStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' }
> = {
  confirmed: { label: 'Confirmado', variant: 'success' },
  accepted: { label: 'Aceito', variant: 'warning' },
  failed: { label: 'Falhou', variant: 'danger' },
};

export const describeStep = (step: SceneStep, deviceName: (id: string) => string): string => {
  const params = step.params ? Object.values(step.params).join(', ') : '';
  return `${commandLabel(step.command)}${params ? ` (${params})` : ''} · ${deviceName(step.deviceId)}`;
};
