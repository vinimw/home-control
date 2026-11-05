import { z } from 'zod';
import type {
  SpotifyPlayerCapabilities,
  SpotifyPlayerCommand,
  SpotifyPlayerResult,
  SpotifyPlayerState,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { HomeAssistantService } from '../homeassistant/service.js';
import type { HassState } from '../homeassistant/types.js';

// Home Assistant MediaPlayerEntityFeature bits.
const PAUSE = 1;
const PREVIOUS_TRACK = 16;
const NEXT_TRACK = 32;
const PLAY_MEDIA = 512;
const SELECT_SOURCE = 2048;
const PLAY = 16384;

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;

export const playerCommandBody = z
  .object({ command: z.enum(['play', 'pause', 'next', 'previous']) })
  .strict();
export const playerSourceBody = z.object({ source: z.string().min(1).max(200) }).strict();
export const playerPlaylistBody = z.object({ playlistId: z.string().regex(SPOTIFY_ID) }).strict();

const SERVICE: Record<SpotifyPlayerCommand, string> = {
  play: 'media_play',
  pause: 'media_pause',
  next: 'media_next_track',
  previous: 'media_previous_track',
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const NONE: SpotifyPlayerCapabilities = {
  play: false,
  pause: false,
  next: false,
  previous: false,
  selectSource: false,
  playPlaylist: false,
};

export interface SpotifyPlayerOptions {
  homeAssistant: HomeAssistantService;
  /** Fixed entity id; otherwise the first `media_player.spotify*` entity is used. */
  entityId?: string | null;
  confirmTimeoutMs?: number;
  pollMs?: number;
}

/**
 * Controls Spotify through Home Assistant's media player. The entity and the service names are chosen
 * here, never by the client, and every command is checked against the features Home Assistant reports.
 */
export class SpotifyPlayerService {
  constructor(private readonly options: SpotifyPlayerOptions) {}

  async state(): Promise<SpotifyPlayerState> {
    return toPlayerState(await this.find());
  }

  async command(command: SpotifyPlayerCommand): Promise<SpotifyPlayerResult> {
    const entity = await this.require();
    const caps = toPlayerState(entity).capabilities;
    if (!caps[command]) {
      throw new ApiError(
        'unsupported_action',
        'O Spotify não aceita este comando agora. Inicie a reprodução em uma saída primeiro.',
      );
    }
    await this.call('media_player', SERVICE[command], { entity_id: entity.entity_id });
    const expected = command === 'play' ? 'playing' : command === 'pause' ? 'paused' : null;
    return this.settle(entity.entity_id, (s) =>
      expected ? s.state === expected : changed(entity, s),
    );
  }

  async selectSource(source: string): Promise<SpotifyPlayerResult> {
    const entity = await this.require();
    const state = toPlayerState(entity);
    if (!state.capabilities.selectSource) {
      throw new ApiError('unsupported_action', 'O Spotify não permite escolher a saída agora.');
    }
    if (!state.sources.includes(source)) {
      throw new ApiError(
        'device_unavailable',
        'Essa saída não está disponível no Spotify agora. Abra o Spotify nela e atualize a lista.',
      );
    }
    await this.call('media_player', 'select_source', { entity_id: entity.entity_id, source });
    return this.settle(entity.entity_id, (s) => str(s.attributes.source) === source);
  }

  async playPlaylist(playlistId: string): Promise<SpotifyPlayerResult> {
    const entity = await this.require();
    if (!toPlayerState(entity).capabilities.playPlaylist) {
      throw new ApiError(
        'unsupported_action',
        'O Spotify não aceita iniciar playlists agora. Escolha uma saída ativa primeiro.',
      );
    }
    await this.call('media_player', 'play_media', {
      entity_id: entity.entity_id,
      media_content_type: 'playlist',
      media_content_id: `spotify:playlist:${playlistId}`,
    });
    return this.settle(entity.entity_id, (s) => s.state === 'playing');
  }

  private async find(): Promise<HassState | null> {
    const rest = this.options.homeAssistant.rest;
    const fixed = this.options.entityId;
    if (fixed) return rest.getState(fixed).catch(notFoundToNull);
    const states = await rest.getStates();
    return states.find((s) => s.entity_id.startsWith('media_player.spotify')) ?? null;
  }

  private async require(): Promise<HassState> {
    const entity = await this.find();
    if (!entity) {
      throw new ApiError(
        'not_found',
        'Nenhum player do Spotify encontrado no Home Assistant. Adicione a integração oficial.',
      );
    }
    if (entity.state === 'unavailable') {
      throw new ApiError('device_unavailable', 'O Spotify está indisponível no Home Assistant.');
    }
    return entity;
  }

  private async call(domain: string, service: string, data: Record<string, unknown>) {
    await this.options.homeAssistant.rest.callService(domain, service, data);
  }

  /** `confirmed` only when the expected state was actually observed before the timeout. */
  private async settle(
    entityId: string,
    isDone: (state: HassState) => boolean,
  ): Promise<SpotifyPlayerResult> {
    const deadline = Date.now() + (this.options.confirmTimeoutMs ?? 4000);
    const poll = this.options.pollMs ?? 500;
    let latest: HassState | null = null;
    for (;;) {
      latest = await this.options.homeAssistant.rest.getState(entityId).catch(() => latest);
      if (latest && isDone(latest)) return { status: 'confirmed', player: toPlayerState(latest) };
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, poll));
    }
    return { status: 'accepted', player: toPlayerState(latest) };
  }
}

function notFoundToNull(error: unknown): null {
  if (error instanceof ApiError && (error.code === 'not_found' || error.code === 'bad_request')) {
    return null;
  }
  throw error;
}

const changed = (before: HassState, after: HassState): boolean =>
  before.attributes.media_title !== after.attributes.media_title;

export function toPlayerState(entity: HassState | null): SpotifyPlayerState {
  if (!entity) {
    return {
      configured: false,
      entityId: null,
      state: null,
      sources: [],
      activeSource: null,
      track: null,
      capabilities: NONE,
    };
  }
  const a = entity.attributes;
  const features = typeof a.supported_features === 'number' ? a.supported_features : 0;
  const usable = entity.state !== 'unavailable' && entity.state !== 'unknown';
  const has = (bit: number) => usable && (features & bit) === bit;
  const sources = Array.isArray(a.source_list)
    ? a.source_list.filter((s): s is string => typeof s === 'string')
    : [];
  const title = str(a.media_title);
  return {
    configured: true,
    entityId: entity.entity_id,
    state: entity.state,
    sources,
    activeSource: str(a.source),
    track: title ? { title, artist: str(a.media_artist), album: str(a.media_album_name) } : null,
    capabilities: {
      play: has(PLAY) && entity.state !== 'playing',
      pause: has(PAUSE) && entity.state === 'playing',
      next: has(NEXT_TRACK),
      previous: has(PREVIOUS_TRACK),
      selectSource: has(SELECT_SOURCE) && sources.length > 0,
      playPlaylist: has(PLAY_MEDIA),
    },
  };
}
