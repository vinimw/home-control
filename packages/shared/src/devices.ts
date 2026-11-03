/**
 * Canonical device model. Provider identifiers (e.g. Home Assistant entity ids) are intentionally
 * absent: they stay on the server and are never part of any public contract.
 */

export type DeviceType =
  | 'light'
  | 'switch'
  | 'tv'
  | 'speaker'
  | 'media_player'
  | 'climate'
  | 'cover'
  | 'fan'
  | 'scene'
  | 'script'
  | 'button'
  | 'sensor'
  | 'binary_sensor';

/**
 * - `available`: the device reported a usable state.
 * - `unavailable`: the provider says the device cannot be reached (offline, unplugged).
 * - `unknown`: the device exists but has not reported a state yet.
 */
export type DeviceAvailability = 'available' | 'unavailable' | 'unknown';

export type DeviceCapability =
  | 'power'
  | 'brightness'
  | 'color_temperature'
  | 'color'
  | 'volume'
  | 'mute'
  | 'playback'
  | 'track_skip'
  | 'source'
  | 'target_temperature'
  | 'hvac_mode'
  | 'position'
  | 'fan_speed'
  | 'activate'
  | 'sensor';

export type DeviceCommandName =
  | 'turn_on'
  | 'turn_off'
  | 'set_brightness'
  | 'set_color_temperature'
  | 'set_color'
  | 'set_volume'
  | 'volume_up'
  | 'volume_down'
  | 'set_mute'
  | 'play'
  | 'pause'
  | 'stop'
  | 'next_track'
  | 'previous_track'
  | 'select_source'
  | 'set_temperature'
  | 'set_hvac_mode'
  | 'open'
  | 'close'
  | 'set_position'
  | 'set_fan_speed'
  | 'activate';

export interface CommandParam {
  name: string;
  type: 'number' | 'string' | 'boolean';
  min?: number;
  max?: number;
  /** Allowed values for string params (e.g. TV sources). */
  options?: string[];
}

/** An action the device actually supports right now. Anything not listed is not supported. */
export interface DeviceCommand {
  name: DeviceCommandName;
  params: CommandParam[];
}

export interface DeviceState {
  power: 'on' | 'off' | null;
  /** 0-100 */
  brightness: number | null;
  /** 0-100 */
  volume: number | null;
  muted: boolean | null;
  playback: 'playing' | 'paused' | 'idle' | null;
  source: string | null;
  /** Cover position, 0-100 */
  position: number | null;
  temperature: number | null;
  targetTemperature: number | null;
  hvacMode: string | null;
  /** Sensors: the measured value. */
  reading: { value: string | number; unit: string | null } | null;
}

export interface DeviceRoom {
  id: string;
  name: string;
}

export interface Device {
  /** Opaque, stable identifier. Not derived from anything the client can use to reach the provider. */
  id: string;
  name: string;
  type: DeviceType;
  availability: DeviceAvailability;
  room: DeviceRoom | null;
  manufacturer: string | null;
  model: string | null;
  capabilities: DeviceCapability[];
  commands: DeviceCommand[];
  state: DeviceState;
}

/** How much registry data the provider exposed: `states_only` has no rooms or manufacturers. */
export type DeviceEnrichment = 'full' | 'states_only';

export interface DeviceRegistrySummary {
  ready: boolean;
  lastRefreshedAt: string | null;
  enrichment: DeviceEnrichment | null;
  total: number;
  byAvailability: Record<DeviceAvailability, number>;
  /** Entities skipped because their domain is not supported, or they are hidden/diagnostic. */
  ignored: number;
  lastError: { code: string; message: string } | null;
}
