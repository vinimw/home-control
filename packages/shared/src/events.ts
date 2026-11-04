/**
 * Realtime stream of device changes (`GET /devices/events`, Server-Sent Events).
 *
 * The opening event includes the API's current cached snapshot; clients apply subsequent events on top.
 * Older servers without snapshots are supported by loading `GET /devices` after (re)connection. Events can be missed (network, restarts), which
 * is why `resync` exists and why a client must also be able to fall back to plain polling.
 */
import type { Device } from './devices.js';
import type { DeviceListResponse } from './actions.js';

export const API_DEVICE_EVENTS_PATH = '/devices/events';

/** Names of the SSE `event:` field. Comment lines (`: ping`) are heartbeats and carry no data. */
export const DEVICE_EVENT_NAMES = ['ready', 'device', 'resync'] as const;

export type DeviceEventName = (typeof DEVICE_EVENT_NAMES)[number];

/** Sent once when the stream opens. */
export interface DeviceReadyEvent {
  serverTime: string;
  /** Cached API snapshot captured when subscribing. Optional for older API versions. */
  snapshot?: DeviceListResponse;
}

/** A single device changed (state, availability, alias, favorite...). Carries the full current device. */
export type DeviceChangedEvent = Device;

/** Something changed that a single-device event cannot express (devices added/removed, rooms): reload the list. */
export interface DeviceResyncEvent {
  reason: 'refresh' | 'removed' | 'rooms' | 'settings';
}
