'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Device,
  DeviceListResponse,
  DeviceRegistrySummary,
  DeviceReadyEvent,
} from '@home-control/shared';
import { DEVICE_EVENTS_URL, fetchDevices } from '@/lib/devices-client';

/**
 * - `connecting`: opening the live stream for the first time.
 * - `live`: the stream is open; changes arrive as they happen.
 * - `reconnecting`: the stream dropped. The list keeps refreshing by polling until it is back.
 */
export type Connection = 'connecting' | 'live' | 'reconnecting';

const POLL_WHEN_DOWN_MS = 10_000;
/** Safety net while live: events can be lost, and room/name changes upstream emit none. */
const POLL_WHEN_LIVE_MS = 60_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export interface DevicesView {
  devices: Device[];
  summary: DeviceRegistrySummary | null;
  /** True once a list has been received at least once. */
  loaded: boolean;
  /** The last attempt to load the list failed: what is shown may be out of date. */
  stale: boolean;
  connection: Connection;
  /** When the data was last confirmed by the server (list or live event). */
  updatedAt: Date | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Applies a device the server just reported (e.g. in an action result). */
  apply: (device: Device) => void;
}

/**
 * Keeps a live copy of the device list: loads it, applies realtime events and falls back to polling.
 * It only ever stores what the server reported; it never fabricates device state.
 */
export function useDevices(initial: DeviceListResponse | null): DevicesView {
  const [byId, setById] = useState<Map<string, Device>>(
    () => new Map((initial?.devices ?? []).map((device) => [device.id, device])),
  );
  const [summary, setSummary] = useState<DeviceRegistrySummary | null>(initial?.summary ?? null);
  const [loaded, setLoaded] = useState(initial !== null);
  const [stale, setStale] = useState(false);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(initial ? new Date() : null);
  const [refreshing, setRefreshing] = useState(false);

  /** When each device last changed through an event/action, to keep a slow list response from overwriting it. */
  const touchedAt = useRef(new Map<string, number>());
  const connectionRef = useRef<Connection>('connecting');
  const inFlight = useRef<Promise<void> | null>(null);
  const snapshotGeneration = useRef(0);

  const apply = useCallback((device: Device) => {
    touchedAt.current.set(device.id, Date.now());
    setById((current) => new Map(current).set(device.id, device));
    setUpdatedAt(new Date());
  }, []);

  const load = useCallback((): Promise<void> => {
    // Concurrent triggers (reconnect + poll + focus) share one request.
    inFlight.current ??= (async () => {
      const startedAt = Date.now();
      const generation = snapshotGeneration.current;
      try {
        const list = await fetchDevices();
        if (generation !== snapshotGeneration.current) return;
        setById((current) => {
          const next = new Map<string, Device>();
          for (const device of list.devices) {
            const touched = touchedAt.current.get(device.id) ?? 0;
            // A newer event/action result beats a list that was requested before it happened.
            next.set(device.id, touched > startedAt ? (current.get(device.id) ?? device) : device);
          }
          // A device that appeared through an event while the request was in flight is kept.
          for (const [id, device] of current) {
            if (!next.has(id) && (touchedAt.current.get(id) ?? 0) > startedAt) next.set(id, device);
          }
          return next;
        });
        setSummary(list.summary);
        setLoaded(true);
        setStale(false);
        setUpdatedAt(new Date());
      } catch {
        if (generation === snapshotGeneration.current) setStale(true);
      }
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Live stream with reconnection.
  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const setState = (next: Connection) => {
      connectionRef.current = next;
      setConnection(next);
    };

    const open = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (source && source.readyState !== EventSource.CLOSED) return;
      source = new EventSource(DEVICE_EVENTS_URL);

      source.addEventListener('ready', (event) => {
        attempts = 0;
        setState('live');
        try {
          const { snapshot } = JSON.parse((event as MessageEvent<string>).data) as DeviceReadyEvent;
          if (!snapshot || !Array.isArray(snapshot.devices) || !snapshot.summary)
            throw new Error('Missing snapshot');
          // Invalidate earlier list requests so they cannot overwrite this newer baseline.
          snapshotGeneration.current += 1;
          touchedAt.current.clear();
          setById(new Map(snapshot.devices.map((device) => [device.id, device])));
          setSummary(snapshot.summary);
          setLoaded(true);
          setStale(false);
          setUpdatedAt(new Date());
        } catch {
          // Compatibility with an older server, or malformed data: request a trusted baseline.
          void load();
        }
      });
      source.addEventListener('device', (event) => {
        try {
          apply(JSON.parse((event as MessageEvent<string>).data) as Device);
        } catch {
          void load(); // an unreadable event is not trusted: resync instead
        }
      });
      source.addEventListener('resync', () => void load());
      source.addEventListener('error', () => {
        if (connectionRef.current !== 'reconnecting') void load();
        setState('reconnecting');
        // The browser retries by itself unless the server answered with an error status.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
          attempts += 1;
          retryTimer = setTimeout(open, delay + Math.random() * 500);
        }
      });
    };

    const pause = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      source?.close();
      source = null;
      setState('connecting');
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') open();
      else pause();
    };
    open();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply, load]);

  // Safety polling only while visible. Foreground resumption gets its baseline from the SSE snapshot.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = connectionRef.current === 'live' ? POLL_WHEN_LIVE_MS : POLL_WHEN_DOWN_MS;
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void load();
        schedule();
      }, wait);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [load, connection]);

  return {
    devices: [...byId.values()],
    summary,
    loaded,
    stale,
    connection,
    updatedAt,
    refreshing,
    refresh,
    apply,
  };
}
