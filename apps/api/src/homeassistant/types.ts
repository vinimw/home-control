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
