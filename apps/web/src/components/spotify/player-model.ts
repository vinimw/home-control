import type { SpotifyControlState, SpotifyDevice, SpotifyPlayback } from '@home-control/shared';

/** What the player should say about itself, derived only from what Spotify reported. */
export type PlayerStatus =
  | 'playing'
  | 'paused'
  /** Something is active but Spotify gave no track information (an ad, a podcast...). */
  | 'no_metadata'
  /** Outputs exist but none is active. */
  | 'idle'
  /** No output is available at all. */
  | 'no_output'
  /** Reading is possible but controlling is not (no permission or no Premium). */
  | 'read_only';

export interface PlayerModel {
  playback: SpotifyPlayback | null;
  active: SpotifyDevice | null;
  status: PlayerStatus;
  label: string;
  /** Spotify allows this action (`disallows`), a control is possible and an output is active. */
  can: (action: 'pausing' | 'resuming' | 'skipping_next' | 'skipping_prev' | 'seeking') => boolean;
  /** Controls that need an active output are usable. */
  controllable: boolean;
}

const LABEL: Record<PlayerStatus, string> = {
  playing: 'Tocando',
  paused: 'Pausado',
  no_metadata: 'Sem informações da faixa',
  idle: 'Sem saída ativa',
  no_output: 'Nenhuma saída disponível',
  read_only: 'Somente leitura',
};

export function derivePlayer(state: SpotifyControlState): PlayerModel {
  const { playback, devices } = state;
  const active = devices.find((d) => d.isActive) ?? playback?.device ?? null;
  const blocked = !state.canControl || state.premium === false;
  const status: PlayerStatus = blocked
    ? 'read_only'
    : !active
      ? devices.length === 0
        ? 'no_output'
        : 'idle'
      : !playback
        ? 'idle'
        : !playback.track
          ? 'no_metadata'
          : playback.isPlaying
            ? 'playing'
            : 'paused';
  const controllable = !blocked && active !== null;
  return {
    playback,
    active,
    status,
    label: LABEL[status],
    controllable,
    can: (action) => controllable && !(playback?.disallowed ?? []).includes(action),
  };
}

export const formatTime = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms)) return '–:––';
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
