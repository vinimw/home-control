import type {
  Device,
  DeviceAvailability,
  DeviceEnrichment,
  DeviceRegistrySummary,
} from '@home-control/shared';
import { toErrorPayload } from '../homeassistant/errors.js';
import type { HomeAssistantService } from '../homeassistant/service.js';
import type { HassStateChangedEvent, Logger } from '../homeassistant/types.js';
import { classifyEntity, type ProviderBinding, type RegistryContext } from './classify.js';
import { EMPTY_SNAPSHOT, fetchRegistries, type RegistrySnapshot } from './ha-registries.js';

export interface DeviceRegistryOptions {
  service: HomeAssistantService;
  logger: Logger;
  /** Full resync interval. Needed because room/name changes do not emit state events. */
  refreshIntervalMs: number;
}

interface Entry {
  device: Device;
  binding: ProviderBinding;
}

/** Delay before resyncing after an entity we have never seen shows up. */
const NEW_ENTITY_REFRESH_DELAY_MS = 2000;

/**
 * In-memory registry of normalized devices.
 *
 * Provider identifiers never leave this class through `list`/`get`/`summary`; they are only reachable
 * server-side through `resolve`, which command dispatch uses.
 */
export class DeviceRegistry {
  private entries = new Map<string, Entry>(); // device id -> entry
  private deviceIdByEntity = new Map<string, string>(); // entity id -> device id
  private ignored = new Set<string>(); // entity ids deliberately not exposed
  private snapshot: RegistrySnapshot = EMPTY_SNAPSHOT;
  private enrichment: DeviceEnrichment | null = null;
  private ready = false;
  private lastRefreshedAt: Date | null = null;
  private lastError: DeviceRegistrySummary['lastError'] = null;

  private refreshing: Promise<void> | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private newEntityTimer: NodeJS.Timeout | null = null;
  private readonly unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(private readonly options: DeviceRegistryOptions) {}

  /** Begins syncing. A no-op when Home Assistant is not configured. */
  start(): void {
    const { service, logger, refreshIntervalMs } = this.options;
    if (this.started || !service.configured) return;
    this.started = true;

    this.unsubscribers.push(
      service.onStateChanged((event) => this.applyStateChange(event)),
      // Events may have been missed while disconnected: resync as soon as the link is back.
      service.realtime.onConnectionChange((state) => {
        if (state === 'connected') void this.refresh();
      }),
    );
    this.intervalTimer = setInterval(() => void this.refresh(), refreshIntervalMs);
    void this.refresh();
    logger.info({ refreshIntervalMs }, 'device registry started');
  }

  stop(): void {
    this.started = false;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.newEntityTimer) clearTimeout(this.newEntityTimer);
    this.intervalTimer = null;
    this.newEntityTimer = null;
  }

  /** Normalized devices, sorted by room then name. Contains no provider identifiers. */
  list(): Device[] {
    return [...this.entries.values()]
      .map((entry) => entry.device)
      .sort(
        (a, b) =>
          (a.room?.name ?? '￿').localeCompare(b.room?.name ?? '￿') || a.name.localeCompare(b.name),
      );
  }

  get(id: string): Device | undefined {
    return this.entries.get(id)?.device;
  }

  /** SERVER-SIDE ONLY: provider binding for a device id. Never serialize the result. */
  resolve(id: string): ProviderBinding | undefined {
    return this.entries.get(id)?.binding;
  }

  summary(): DeviceRegistrySummary {
    const byAvailability: Record<DeviceAvailability, number> = {
      available: 0,
      unavailable: 0,
      unknown: 0,
    };
    for (const { device } of this.entries.values()) byAvailability[device.availability] += 1;

    return {
      ready: this.ready,
      lastRefreshedAt: this.lastRefreshedAt?.toISOString() ?? null,
      enrichment: this.enrichment,
      total: this.entries.size,
      byAvailability,
      ignored: this.ignored.size,
      lastError: this.lastError,
    };
  }

  /** Full resync from Home Assistant. Never throws; failures keep the previous data and are recorded. */
  refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const { service, logger } = this.options;
    try {
      const states = await service.rest.getStates();
      const snapshot = await this.loadRegistries();

      const entries = new Map<string, Entry>();
      const byEntity = new Map<string, string>();
      const ignored = new Set<string>();

      for (const haState of Array.isArray(states) ? states : []) {
        const id = this.safeClassify(haState, snapshot, this.entries);
        if (id === 'ignored') {
          if (typeof haState?.entity_id === 'string') ignored.add(haState.entity_id);
        } else if (id) {
          entries.set(id.device.id, id);
          byEntity.set(id.binding.entityId, id.device.id);
        }
      }

      // Single swap: readers never see a half-built registry.
      this.entries = entries;
      this.deviceIdByEntity = byEntity;
      this.ignored = ignored;
      this.snapshot = snapshot;
      this.ready = true;
      this.lastRefreshedAt = new Date();
      this.lastError = null;
      logger.info(
        { devices: entries.size, ignored: ignored.size, enrichment: this.enrichment },
        'device registry refreshed',
      );
    } catch (error) {
      this.lastError = toErrorPayload(error);
      logger.warn(
        { code: this.lastError.code },
        'device registry refresh failed; keeping previous data',
      );
    }
  }

  /** Registry data is optional: without admin rights we still expose devices, just without rooms. */
  private async loadRegistries(): Promise<RegistrySnapshot> {
    try {
      const snapshot = await fetchRegistries(this.options.service.realtime);
      this.enrichment = 'full';
      return snapshot;
    } catch (error) {
      this.options.logger.warn(
        { code: toErrorPayload(error).code },
        'home assistant registries unavailable; using states only',
      );
      // A stale snapshot (rooms from the last good sync) beats dropping every room.
      if (this.enrichment === null) this.enrichment = 'states_only';
      return this.snapshot;
    }
  }

  private contextFor(entityId: string, snapshot: RegistrySnapshot): RegistryContext {
    const entity = snapshot.entities.get(entityId);
    const device = entity?.device_id ? snapshot.devices.get(entity.device_id) : undefined;
    return { entity, device, areas: snapshot.areas };
  }

  /** Classifies one entity; a malformed entity is ignored instead of breaking the whole sync. */
  private safeClassify(
    haState: HassStateChangedEvent['new_state'],
    snapshot: RegistrySnapshot,
    known: ReadonlyMap<string, Entry>,
  ): Entry | 'ignored' {
    if (!haState || typeof haState.entity_id !== 'string') return 'ignored';
    try {
      const previousId = this.deviceIdByEntity.get(haState.entity_id);
      const previous = previousId ? known.get(previousId)?.device : undefined;
      return (
        classifyEntity(haState, this.contextFor(haState.entity_id, snapshot), previous) ?? 'ignored'
      );
    } catch (error) {
      this.options.logger.warn(
        { domain: haState.entity_id.split('.')[0], err: String(error) },
        'could not classify entity; ignoring it',
      );
      return 'ignored';
    }
  }

  /** Live update from a `state_changed` event. */
  private applyStateChange(event: HassStateChangedEvent): void {
    const entityId = event.entity_id;
    if (typeof entityId !== 'string') return;

    if (!event.new_state) {
      // Entity removed at the provider.
      const id = this.deviceIdByEntity.get(entityId);
      if (id) this.entries.delete(id);
      this.deviceIdByEntity.delete(entityId);
      this.ignored.delete(entityId);
      return;
    }

    const wasKnown = this.deviceIdByEntity.has(entityId) || this.ignored.has(entityId);
    const result = this.safeClassify(event.new_state, this.snapshot, this.entries);

    if (result === 'ignored') {
      const id = this.deviceIdByEntity.get(entityId);
      if (id) this.entries.delete(id);
      this.deviceIdByEntity.delete(entityId);
      this.ignored.add(entityId);
    } else {
      this.entries.set(result.device.id, result);
      this.deviceIdByEntity.set(entityId, result.device.id);
      this.ignored.delete(entityId);
    }

    // A brand-new entity has no registry data yet (room, hidden flags): resync shortly to pick it up.
    if (!wasKnown && this.ready) this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.newEntityTimer) return;
    this.newEntityTimer = setTimeout(() => {
      this.newEntityTimer = null;
      void this.refresh();
    }, NEW_ENTITY_REFRESH_DELAY_MS);
  }
}
