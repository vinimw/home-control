import type { ProviderBinding } from '../classify.js';

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

type Params = Record<string, unknown>;
type Builder = (entityId: string, params: Params) => ServiceCall['data'];

interface Route {
  service: string;
  build: Builder;
  /** Domain whose service to call; defaults to the entity's own domain. */
  domain?: string;
}

const entityOnly: Builder = (entityId) => ({ entity_id: entityId });

/**
 * THE ONLY place where canonical commands become Home Assistant services.
 *
 * Clients never choose a service, a domain or an entity: they send a canonical command and validated
 * params; the entity comes from the server-side binding. Service `data` is assembled from explicit,
 * named params only, so nothing else a client sends can reach Home Assistant.
 */
const ROUTES: Record<string, Record<string, Route>> = {
  turn_on: {
    light: { service: 'turn_on', build: entityOnly },
    switch: { service: 'turn_on', build: entityOnly },
    input_boolean: { service: 'turn_on', build: entityOnly },
    fan: { service: 'turn_on', build: entityOnly },
    media_player: { service: 'turn_on', build: entityOnly },
    climate: { service: 'turn_on', build: entityOnly },
  },
  turn_off: {
    light: { service: 'turn_off', build: entityOnly },
    switch: { service: 'turn_off', build: entityOnly },
    input_boolean: { service: 'turn_off', build: entityOnly },
    fan: { service: 'turn_off', build: entityOnly },
    media_player: { service: 'turn_off', build: entityOnly },
    climate: { service: 'turn_off', build: entityOnly },
  },
  set_brightness: {
    light: { service: 'turn_on', build: (e, p) => ({ entity_id: e, brightness_pct: p.level }) },
  },
  set_color_temperature: {
    light: { service: 'turn_on', build: (e, p) => ({ entity_id: e, color_temp_kelvin: p.kelvin }) },
  },
  set_color: {
    light: {
      service: 'turn_on',
      build: (e, p) => ({ entity_id: e, hs_color: [p.hue, p.saturation] }),
    },
  },
  set_volume: {
    media_player: {
      service: 'volume_set',
      build: (e, p) => ({ entity_id: e, volume_level: Number(p.level) / 100 }),
    },
  },
  volume_up: { media_player: { service: 'volume_up', build: entityOnly } },
  volume_down: { media_player: { service: 'volume_down', build: entityOnly } },
  set_mute: {
    media_player: {
      service: 'volume_mute',
      build: (e, p) => ({ entity_id: e, is_volume_muted: p.muted }),
    },
  },
  play: { media_player: { service: 'media_play', build: entityOnly } },
  pause: { media_player: { service: 'media_pause', build: entityOnly } },
  stop: {
    media_player: { service: 'media_stop', build: entityOnly },
    cover: { service: 'stop_cover', build: entityOnly },
  },
  next_track: { media_player: { service: 'media_next_track', build: entityOnly } },
  previous_track: { media_player: { service: 'media_previous_track', build: entityOnly } },
  select_source: {
    media_player: {
      service: 'select_source',
      build: (e, p) => ({ entity_id: e, source: p.source }),
    },
  },
  set_temperature: {
    climate: {
      service: 'set_temperature',
      build: (e, p) => ({ entity_id: e, temperature: p.temperature }),
    },
  },
  set_hvac_mode: {
    climate: {
      service: 'set_hvac_mode',
      build: (e, p) => ({ entity_id: e, hvac_mode: p.mode }),
    },
  },
  open: { cover: { service: 'open_cover', build: entityOnly } },
  close: { cover: { service: 'close_cover', build: entityOnly } },
  set_position: {
    cover: {
      service: 'set_cover_position',
      build: (e, p) => ({ entity_id: e, position: p.position }),
    },
  },
  set_fan_speed: {
    fan: {
      service: 'set_percentage',
      build: (e, p) => ({ entity_id: e, percentage: p.percentage }),
    },
  },
  activate: {
    scene: { service: 'turn_on', build: entityOnly },
    script: { service: 'turn_on', build: entityOnly },
    button: { service: 'press', build: entityOnly },
  },
};

/** Returns the Home Assistant call for a canonical command, or `null` when there is no mapping. */
export function toServiceCall(
  binding: ProviderBinding,
  command: string,
  params: Params,
): ServiceCall | null {
  const route = ROUTES[command]?.[binding.domain];
  if (!route) return null;
  return {
    domain: route.domain ?? binding.domain,
    service: route.service,
    data: route.build(binding.entityId, params),
  };
}
