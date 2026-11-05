import type {
  MediaActivityResponse,
  MediaPlaybackState,
  MediaSource,
  MediaSourceKind,
} from '@home-control/shared';
import type { Device } from '@home-control/shared';
import type { HomeAssistantService } from '../homeassistant/service.js';
import type { HassState } from '../homeassistant/types.js';
import type { DeviceRegistry } from '../devices/registry.js';

const CACHE_MS = 2500;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 200) : null;

function kindOf(device: Device): MediaSourceKind | null {
  if (device.type === 'tv') return 'tv';
  if (device.type === 'speaker' && /echo/i.test(device.sourceName)) return 'echo';
  return null;
}

function stateOf(state: string): MediaPlaybackState {
  switch (state) {
    case 'playing':
    case 'paused':
    case 'idle':
    case 'off':
    case 'unavailable':
    case 'unknown':
      return state;
    case 'on':
    case 'standby':
      return 'on';
    default:
      return 'unknown';
  }
}

/**
 * Normalized "what is playing" across the TV, the Echo and Spotify, read from the Home Assistant media
 * players. It exposes only what the integration really reports (title/artist/app) and caches one `states`
 * call for a few seconds, so a screen refreshing every few seconds costs Home Assistant almost nothing.
 */
export class MediaActivityService {
  private cache: { at: number; value: MediaActivityResponse } | null = null;
  private inFlight: Promise<MediaActivityResponse> | null = null;

  constructor(
    private readonly options: { registry: DeviceRegistry; homeAssistant: HomeAssistantService },
  ) {}

  async snapshot(): Promise<MediaActivityResponse> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<MediaActivityResponse> {
    const { registry, homeAssistant } = this.options;
    const states = new Map<string, HassState>(
      (await homeAssistant.rest.getStates()).map((s) => [s.entity_id, s]),
    );
    const sources: MediaSource[] = [];
    for (const device of registry.list()) {
      const kind = kindOf(device);
      const binding = registry.resolve(device.id);
      const raw = binding ? states.get(binding.entityId) : undefined;
      if (!kind || !binding || binding.domain !== 'media_player' || !raw) continue;
      const a = raw.attributes;
      const app = kind === 'tv' ? (str(a.source) ?? str(a.app_id)) : null;
      const title = str(a.media_title);
      sources.push({
        deviceId: device.id,
        name: device.name,
        kind,
        state: stateOf(raw.state),
        // Some TVs report the app name as the title: that is not content, so it is not shown as such.
        title: title && title !== app ? title : null,
        artist: str(a.media_artist),
        app,
        lastChanged: raw.last_changed ?? null,
        commands: device.commands.map((c) => c.name),
      });
    }
    const value = { sources, updatedAt: new Date().toISOString() };
    this.cache = { at: Date.now(), value };
    return value;
  }
}
