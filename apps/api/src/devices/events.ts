import type { Device, DeviceResyncEvent } from '@home-control/shared';

export type DeviceStreamMessage =
  { event: 'device'; data: Device } | { event: 'resync'; data: DeviceResyncEvent };

type Listener = (message: DeviceStreamMessage) => void;

/**
 * Fan-out of device changes to realtime subscribers (the SSE stream).
 *
 * It only carries what the catalog already exposes (the public device view), so provider identifiers
 * can never leak through it.
 */
export class DeviceEventHub {
  private readonly listeners = new Set<Listener>();

  constructor(private readonly view: (deviceId: string) => Device | undefined) {}

  get subscribers(): number {
    return this.listeners.size;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A device changed. The current view is read at publish time, so the event is never stale. */
  device(deviceId: string): void {
    if (this.listeners.size === 0) return;
    const device = this.view(deviceId);
    if (!device) {
      this.resync('removed');
      return;
    }
    this.emit({ event: 'device', data: device });
  }

  resync(reason: DeviceResyncEvent['reason']): void {
    this.emit({ event: 'resync', data: { reason } });
  }

  private emit(message: DeviceStreamMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // One broken subscriber must never affect the others or the live sync.
      }
    }
  }
}
