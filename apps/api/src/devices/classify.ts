import { createHash } from 'node:crypto';
import {
  REMOTE_KEYS,
  type CommandParam,
  type Device,
  type DeviceAvailability,
  type DeviceCapability,
  type DeviceCommand,
  type DeviceCommandName,
  type DeviceState,
  type DeviceType,
} from '@home-control/shared';
import type {
  HassDeviceRegistryEntry,
  HassEntityRegistryEntry,
  HassState,
} from '../homeassistant/types.js';

/** Server-side only: how to reach the device at the provider. Never serialized to clients. */
export interface ProviderBinding {
  entityId: string;
  domain: string;
  /** Remote-control entity that sends this device's navigation keys, when one is associated. */
  remoteEntityId?: string;
  /** Home Assistant device id: what `alexa_devices.send_text_command` targets. Echo devices only. */
  haDeviceId?: string;
}

export interface RegistryContext {
  entity?: HassEntityRegistryEntry;
  device?: HassDeviceRegistryEntry;
  areas?: ReadonlyMap<string, string>;
  /** Remote entity associated with this entity (same Home Assistant device, or an explicit link). */
  remoteEntityId?: string;
  /** Launchable applications by display name (configuration). */
  apps?: ReadonlyMap<string, string>;
}

export interface ClassifiedDevice {
  device: Device;
  binding: ProviderBinding;
}

// Home Assistant `supported_features` bit flags.
const MEDIA = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  VOLUME_STEP: 1024,
  SELECT_SOURCE: 2048,
  STOP: 4096,
  PLAY_MEDIA: 512,
  PLAY: 16384,
} as const;
const CLIMATE = { TARGET_TEMPERATURE: 1, TURN_OFF: 128, TURN_ON: 256 } as const;
const COVER = { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 } as const;
const FAN = { SET_SPEED: 1 } as const;

const COLOR_MODES = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww']);
/** Domains whose state is not a connectivity signal: `unknown` just means "never triggered". */
const STATELESS_DOMAINS = new Set(['scene', 'button']);
const SUPPORTED_DOMAINS = new Set([
  'light',
  'switch',
  'input_boolean',
  'media_player',
  'climate',
  'cover',
  'fan',
  'scene',
  'script',
  'button',
  'sensor',
  'binary_sensor',
]);

const emptyState = (): DeviceState => ({
  power: null,
  brightness: null,
  volume: null,
  muted: null,
  playback: null,
  source: null,
  position: null,
  temperature: null,
  targetTemperature: null,
  hvacMode: null,
  reading: null,
});

// --- tolerant readers: provider data is never trusted to be well-formed -------------------------

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const features = (attributes: Record<string, unknown>): number => {
  const raw = asNumber(attributes.supported_features);
  return raw === null ? 0 : Math.trunc(raw);
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

function stableId(prefix: string, input: string, length: number): string {
  return `${prefix}_${createHash('sha256').update(input).digest('hex').slice(0, length)}`;
}

export const deviceIdFor = (entityId: string): string =>
  stableId('dev', `home-assistant:${entityId}`, 16);

function humanize(entityId: string): string {
  const objectId = entityId.split('.')[1] ?? entityId;
  return objectId.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function availabilityOf(domain: string, state: string): DeviceAvailability {
  if (state === 'unavailable') return 'unavailable';
  if (state === 'unknown' && !STATELESS_DOMAINS.has(domain)) return 'unknown';
  return 'available';
}

// --- per-domain mapping -------------------------------------------------------------------------

interface Mapping {
  type: DeviceType;
  capabilities: DeviceCapability[];
  commands: DeviceCommand[];
  state: DeviceState;
}

const cmd = (name: DeviceCommandName, params: CommandParam[] = []): DeviceCommand => ({
  name,
  params,
});

const percentParam = (name: string): CommandParam => ({ name, type: 'number', min: 0, max: 100 });

function mapLight(attrs: Record<string, unknown>, state: string): Mapping {
  const modes = asStringArray(attrs.supported_color_modes);
  const capabilities: DeviceCapability[] = ['power'];
  const commands = [cmd('turn_on'), cmd('turn_off')];

  if (modes.some((mode) => mode !== 'onoff')) {
    capabilities.push('brightness');
    commands.push(cmd('set_brightness', [percentParam('level')]));
  }
  if (modes.includes('color_temp')) {
    capabilities.push('color_temperature');
    const min = asNumber(attrs.min_color_temp_kelvin);
    const max = asNumber(attrs.max_color_temp_kelvin);
    commands.push(
      cmd('set_color_temperature', [
        {
          name: 'kelvin',
          type: 'number',
          ...(min === null ? {} : { min }),
          ...(max === null ? {} : { max }),
        },
      ]),
    );
  }
  if (modes.some((mode) => COLOR_MODES.has(mode))) {
    capabilities.push('color');
    commands.push(
      cmd('set_color', [
        { name: 'hue', type: 'number', min: 0, max: 360 },
        percentParam('saturation'),
      ]),
    );
  }

  const brightness = asNumber(attrs.brightness);
  return {
    type: 'light',
    capabilities,
    commands,
    state: {
      ...emptyState(),
      power: state === 'on' ? 'on' : 'off',
      brightness: brightness === null ? null : clampPercent((brightness / 255) * 100),
    },
  };
}

function mapSwitch(state: string): Mapping {
  return {
    type: 'switch',
    capabilities: ['power'],
    commands: [cmd('turn_on'), cmd('turn_off')],
    state: { ...emptyState(), power: state === 'on' ? 'on' : 'off' },
  };
}

function mapMediaPlayer(
  attrs: Record<string, unknown>,
  state: string,
  context: RegistryContext,
): Mapping {
  const f = features(attrs);
  const capabilities: DeviceCapability[] = [];
  const commands: DeviceCommand[] = [];

  /** Adds a command (and its capability) only when the device advertises the feature bit. */
  const support = (bit: number, capability: DeviceCapability, ...added: DeviceCommand[]) => {
    if ((f & bit) === 0) return;
    if (!capabilities.includes(capability)) capabilities.push(capability);
    commands.push(...added);
  };

  support(MEDIA.TURN_ON, 'power', cmd('turn_on'));
  support(MEDIA.TURN_OFF, 'power', cmd('turn_off'));
  support(MEDIA.PLAY, 'playback', cmd('play'));
  support(MEDIA.PAUSE, 'playback', cmd('pause'));
  support(MEDIA.STOP, 'playback', cmd('stop'));
  support(MEDIA.PREVIOUS_TRACK, 'track_skip', cmd('previous_track'));
  support(MEDIA.NEXT_TRACK, 'track_skip', cmd('next_track'));
  support(MEDIA.VOLUME_SET, 'volume', cmd('set_volume', [percentParam('level')]));
  support(MEDIA.VOLUME_STEP, 'volume', cmd('volume_up'), cmd('volume_down'));
  support(MEDIA.VOLUME_MUTE, 'mute', cmd('set_mute', [{ name: 'muted', type: 'boolean' }]));
  support(
    MEDIA.SELECT_SOURCE,
    'source',
    cmd('select_source', [
      { name: 'source', type: 'string', options: asStringArray(attrs.source_list) },
    ]),
  );

  // Navigation keys go through the associated remote entity: no remote, no keys.
  if (context.remoteEntityId) {
    capabilities.push('remote');
    commands.push(cmd('press_key', [{ name: 'key', type: 'string', options: [...REMOTE_KEYS] }]));
  }

  // Apps: only those the player itself lists (so they are configured on the TV) and can be launched.
  if ((f & MEDIA.PLAY_MEDIA) !== 0 && context.apps) {
    const listed = new Set(asStringArray(attrs.source_list).map((name) => name.toLowerCase()));
    const launchable = [...context.apps.keys()].filter((name) => listed.has(name.toLowerCase()));
    if (launchable.length > 0) {
      capabilities.push('apps');
      commands.push(cmd('launch_app', [{ name: 'app', type: 'string', options: launchable }]));
    }
  }

  const deviceClass = asString(attrs.device_class);
  const type: DeviceType =
    deviceClass === 'tv'
      ? 'tv'
      : deviceClass === 'speaker' || deviceClass === 'receiver'
        ? 'speaker'
        : 'media_player';

  const playback =
    state === 'playing' || state === 'buffering'
      ? 'playing'
      : state === 'paused'
        ? 'paused'
        : state === 'idle' || state === 'on'
          ? 'idle'
          : null;
  const volume = asNumber(attrs.volume_level);

  return {
    type,
    capabilities,
    commands,
    state: {
      ...emptyState(),
      power: state === 'off' || state === 'standby' ? 'off' : 'on',
      playback,
      volume: volume === null ? null : clampPercent(volume * 100),
      muted: typeof attrs.is_volume_muted === 'boolean' ? attrs.is_volume_muted : null,
      source: asString(attrs.source),
    },
  };
}

function mapClimate(attrs: Record<string, unknown>, state: string): Mapping {
  const f = features(attrs);
  const has = (bit: number) => (f & bit) !== 0;
  const capabilities: DeviceCapability[] = [];
  const commands: DeviceCommand[] = [];

  if (has(CLIMATE.TURN_ON) || has(CLIMATE.TURN_OFF)) capabilities.push('power');
  if (has(CLIMATE.TURN_ON)) commands.push(cmd('turn_on'));
  if (has(CLIMATE.TURN_OFF)) commands.push(cmd('turn_off'));

  const hvacModes = asStringArray(attrs.hvac_modes);
  if (hvacModes.length > 0) {
    capabilities.push('hvac_mode');
    commands.push(cmd('set_hvac_mode', [{ name: 'mode', type: 'string', options: hvacModes }]));
  }
  if (has(CLIMATE.TARGET_TEMPERATURE)) {
    capabilities.push('target_temperature');
    const min = asNumber(attrs.min_temp);
    const max = asNumber(attrs.max_temp);
    commands.push(
      cmd('set_temperature', [
        {
          name: 'temperature',
          type: 'number',
          ...(min === null ? {} : { min }),
          ...(max === null ? {} : { max }),
        },
      ]),
    );
  }

  return {
    type: 'climate',
    capabilities,
    commands,
    state: {
      ...emptyState(),
      power: state === 'off' ? 'off' : 'on',
      hvacMode: state,
      temperature: asNumber(attrs.current_temperature),
      targetTemperature: asNumber(attrs.temperature),
    },
  };
}

function mapCover(attrs: Record<string, unknown>): Mapping {
  const f = features(attrs);
  const has = (bit: number) => (f & bit) !== 0;
  const commands: DeviceCommand[] = [];
  if (has(COVER.OPEN)) commands.push(cmd('open'));
  if (has(COVER.CLOSE)) commands.push(cmd('close'));
  if (has(COVER.STOP)) commands.push(cmd('stop'));
  if (has(COVER.SET_POSITION)) commands.push(cmd('set_position', [percentParam('position')]));

  const position = asNumber(attrs.current_position);
  return {
    type: 'cover',
    capabilities: commands.length > 0 ? ['position'] : [],
    commands,
    state: { ...emptyState(), position: position === null ? null : clampPercent(position) },
  };
}

function mapFan(attrs: Record<string, unknown>, state: string): Mapping {
  const has = (bit: number) => (features(attrs) & bit) !== 0;
  const capabilities: DeviceCapability[] = ['power'];
  // Fans always accept on/off, even legacy ones that do not advertise the TURN_* flags.
  const commands = [cmd('turn_on'), cmd('turn_off')];
  if (has(FAN.SET_SPEED)) {
    capabilities.push('fan_speed');
    commands.push(cmd('set_fan_speed', [percentParam('percentage')]));
  }
  return {
    type: 'fan',
    capabilities,
    commands,
    state: { ...emptyState(), power: state === 'on' ? 'on' : 'off' },
  };
}

function mapActivatable(type: 'scene' | 'script' | 'button'): Mapping {
  return {
    type,
    capabilities: ['activate'],
    commands: [cmd('activate')],
    state: emptyState(),
  };
}

function mapSensor(
  type: 'sensor' | 'binary_sensor',
  attrs: Record<string, unknown>,
  state: string,
): Mapping {
  const numeric = state.trim() !== '' ? Number(state) : Number.NaN;
  return {
    type,
    capabilities: ['sensor'],
    commands: [],
    state: {
      ...emptyState(),
      reading: {
        value: type === 'sensor' && Number.isFinite(numeric) ? numeric : state,
        unit: asString(attrs.unit_of_measurement),
      },
    },
  };
}

function mapDomain(
  domain: string,
  attrs: Record<string, unknown>,
  state: string,
  context: RegistryContext,
): Mapping | null {
  switch (domain) {
    case 'light':
      return mapLight(attrs, state);
    case 'switch':
    case 'input_boolean':
      return mapSwitch(state);
    case 'media_player':
      return mapMediaPlayer(attrs, state, context);
    case 'climate':
      return mapClimate(attrs, state);
    case 'cover':
      return mapCover(attrs);
    case 'fan':
      return mapFan(attrs, state);
    case 'scene':
    case 'script':
    case 'button':
      return mapActivatable(domain);
    case 'sensor':
    case 'binary_sensor':
      return mapSensor(domain, attrs, state);
    default:
      return null;
  }
}

/**
 * The Home Assistant device id of an Echo: a media player whose device is made by Amazon. Alexa text
 * commands target this id, so a device without it is never offered as a target.
 */
function echoDeviceId(domain: string, context: RegistryContext): string | undefined {
  if (domain !== 'media_player') return undefined;
  const manufacturer = asString(context.device?.manufacturer)?.toLowerCase();
  return manufacturer === 'amazon' ? context.device?.id : undefined;
}

/** Default type for a supported domain, used when a device is unavailable and was never seen healthy. */
const typeByDomain = (domain: string): DeviceType =>
  domain === 'input_boolean' ? 'switch' : (domain as DeviceType);

/**
 * Maps one provider entity to a canonical device, or returns `null` when it must not be exposed
 * (unsupported domain, hidden, disabled or diagnostic/config entities).
 *
 * `previous` is the last known device. Home Assistant strips `supported_features` from entities that
 * become `unavailable`, so we keep the last known type/capabilities/commands to avoid controls vanishing.
 */
export function classifyEntity(
  haState: HassState,
  context: RegistryContext = {},
  previous?: Device,
): ClassifiedDevice | null {
  const entityId = haState.entity_id;
  if (typeof entityId !== 'string' || !entityId.includes('.')) return null;
  const domain = entityId.split('.')[0] as string;
  if (!SUPPORTED_DOMAINS.has(domain)) return null;

  const { entity, device, areas } = context;
  if (entity?.disabled_by || entity?.hidden_by || entity?.entity_category) return null;

  const attrs =
    haState.attributes && typeof haState.attributes === 'object' ? haState.attributes : {};
  const rawState = typeof haState.state === 'string' ? haState.state : 'unknown';
  const availability = availabilityOf(domain, rawState);

  let type: DeviceType;
  let capabilities: DeviceCapability[];
  let commands: DeviceCommand[];
  let state: DeviceState;

  if (availability === 'available') {
    const mapping = mapDomain(domain, attrs, rawState, context);
    if (!mapping) return null;
    ({ type, capabilities, commands, state } = mapping);
    if (echoDeviceId(domain, context)) capabilities = [...capabilities, 'voice_command'];
  } else if (previous) {
    ({ type, capabilities, commands } = previous);
    state = emptyState();
  } else {
    type = typeByDomain(domain);
    capabilities = [];
    commands = [];
    state = emptyState();
  }

  const sourceName =
    asString(entity?.name) ??
    asString(attrs.friendly_name) ??
    asString(entity?.original_name) ??
    humanize(entityId);

  const areaId = entity?.area_id ?? device?.area_id ?? null;
  const areaName = areaId ? (areas?.get(areaId) ?? null) : null;

  return {
    device: {
      id: deviceIdFor(entityId),
      name: sourceName,
      sourceName,
      // User metadata is layered on top by the DeviceCatalog; the registry only knows Home Assistant.
      alias: null,
      favorite: false,
      type,
      availability,
      room:
        areaId && areaName
          ? { id: stableId('room', `home-assistant:area:${areaId}`, 12), name: areaName }
          : null,
      manufacturer: asString(device?.manufacturer),
      model: asString(device?.model),
      capabilities,
      commands,
      state,
    },
    binding: {
      entityId,
      domain,
      ...(echoDeviceId(domain, context) ? { haDeviceId: echoDeviceId(domain, context) } : {}),
      ...(context.remoteEntityId && domain === 'media_player'
        ? { remoteEntityId: context.remoteEntityId }
        : {}),
    },
  };
}
