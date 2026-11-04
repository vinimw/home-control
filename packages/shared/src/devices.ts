/**
 * Canonical device model. Provider identifiers (e.g. Home Assistant entity ids) are intentionally
 * absent: they stay on the server and are never part of any public contract.
 */

export const DEVICE_TYPES = [
  'light',
  'switch',
  'tv',
  'speaker',
  'media_player',
  'climate',
  'cover',
  'fan',
  'scene',
  'script',
  'button',
  'sensor',
  'binary_sensor',
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

/**
 * - `available`: the device reported a usable state.
 * - `unavailable`: the provider says the device cannot be reached (offline, unplugged).
 * - `unknown`: the device exists but has not reported a state yet.
 */
export const DEVICE_AVAILABILITIES = ['available', 'unavailable', 'unknown'] as const;

export type DeviceAvailability = (typeof DEVICE_AVAILABILITIES)[number];

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
  | 'sensor'
  /** Navigation keys (arrows, OK, Home, Back) sent through a remote-control entity. */
  | 'remote'
  /** Launching applications installed on the device. */
  | 'apps'
  /** Can be sent Alexa text commands (an Echo). */
  | 'voice_command';

/** Keys a remote-capable device can be sent. Each device only advertises the ones it can really press. */
export const REMOTE_KEYS = ['up', 'down', 'left', 'right', 'ok', 'home', 'back'] as const;
export type RemoteKey = (typeof REMOTE_KEYS)[number];

export const DEVICE_COMMAND_NAMES = [
  'turn_on',
  'turn_off',
  'set_brightness',
  'set_color_temperature',
  'set_color',
  'set_volume',
  'volume_up',
  'volume_down',
  'set_mute',
  'play',
  'pause',
  'stop',
  'next_track',
  'previous_track',
  'select_source',
  'set_temperature',
  'set_hvac_mode',
  'open',
  'close',
  'set_position',
  'set_fan_speed',
  'activate',
  'press_key',
  'launch_app',
] as const;

export type DeviceCommandName = (typeof DEVICE_COMMAND_NAMES)[number];

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
  /** Display name: the user's alias when set, otherwise the Home Assistant name. */
  name: string;
  /** The name Home Assistant gives the device (never changed by the user's alias). */
  sourceName: string;
  /** The user's own name for the device, or `null`. Persisted by the API. */
  alias: string | null;
  /** Marked as favorite by the user. Persisted by the API. */
  favorite: boolean;
  type: DeviceType;
  availability: DeviceAvailability;
  /** The user's room when assigned, otherwise the Home Assistant area. */
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
