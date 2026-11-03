import type {
  HassAreaRegistryEntry,
  HassDeviceRegistryEntry,
  HassEntityRegistryEntry,
} from '../homeassistant/types.js';
import type { HomeAssistantWsClient } from '../homeassistant/ws-client.js';

export interface RegistrySnapshot {
  entities: ReadonlyMap<string, HassEntityRegistryEntry>;
  devices: ReadonlyMap<string, HassDeviceRegistryEntry>;
  /** area_id -> area name */
  areas: ReadonlyMap<string, string>;
}

export const EMPTY_SNAPSHOT: RegistrySnapshot = {
  entities: new Map(),
  devices: new Map(),
  areas: new Map(),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Keeps only well-formed rows: the provider payload is never assumed to be valid. */
function rows<T>(value: unknown, isValid: (row: Record<string, unknown>) => boolean): T[] {
  return Array.isArray(value) ? (value.filter((r) => isRecord(r) && isValid(r)) as T[]) : [];
}

/**
 * Loads the entity, device and area registries over the realtime connection. These commands are only
 * available to admin users; callers must handle the rejection and fall back to states-only data.
 */
export async function fetchRegistries(ws: HomeAssistantWsClient): Promise<RegistrySnapshot> {
  const [entities, devices, areas] = await Promise.all([
    ws.sendCommand('config/entity_registry/list', {}, 20_000),
    ws.sendCommand('config/device_registry/list', {}, 20_000),
    ws.sendCommand('config/area_registry/list', {}, 20_000),
  ]);

  return {
    entities: new Map(
      rows<HassEntityRegistryEntry>(entities, (r) => typeof r.entity_id === 'string').map((e) => [
        e.entity_id,
        e,
      ]),
    ),
    devices: new Map(
      rows<HassDeviceRegistryEntry>(devices, (r) => typeof r.id === 'string').map((d) => [d.id, d]),
    ),
    areas: new Map(
      rows<HassAreaRegistryEntry>(
        areas,
        (r) => typeof r.area_id === 'string' && typeof r.name === 'string',
      ).map((a) => [a.area_id, a.name]),
    ),
  };
}
