/** Subset of Home Assistant payloads used by this backend. */
export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassConfig {
  version: string;
  location_name: string;
  state: string;
  [key: string]: unknown;
}

export interface HassStateChangedEvent {
  entity_id: string;
  old_state: HassState | null;
  new_state: HassState | null;
}

/** Minimal logger contract (compatible with Fastify/pino). Never log tokens. */
export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** `config/entity_registry/list` entry (only the fields we use). */
export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  disabled_by?: string | null;
  hidden_by?: string | null;
  entity_category?: string | null;
}

/** `config/device_registry/list` entry (only the fields we use). */
export interface HassDeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

/** `config/area_registry/list` entry. */
export interface HassAreaRegistryEntry {
  area_id: string;
  name: string;
}
