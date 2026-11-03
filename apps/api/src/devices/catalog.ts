import type { Device, Room } from '@home-control/shared';
import type { DeviceSettingsRecord, Storage } from '../storage/index.js';
import type { DeviceRegistry } from './registry.js';

/**
 * The devices as the API presents them: Home Assistant data (from the registry) with the user's own
 * metadata (alias, favorite, room) layered on top at read time.
 *
 * Nothing from Home Assistant is copied into the database, so there is no second copy of device state
 * that could go stale; and the metadata is keyed by the stable device id, so it survives refreshes.
 */
export class DeviceCatalog {
  constructor(
    private readonly registry: DeviceRegistry,
    private readonly storage: Storage,
  ) {}

  list(): Device[] {
    const settings = this.storage.deviceSettings.all();
    const rooms = new Map(this.storage.rooms.list().map((room) => [room.id, room]));
    return this.registry
      .list()
      .map((device) => this.apply(device, settings.get(device.id), rooms))
      .sort(
        (a, b) =>
          (a.room?.name ?? '￿').localeCompare(b.room?.name ?? '￿') || a.name.localeCompare(b.name),
      );
  }

  get(id: string): Device | undefined {
    const device = this.registry.get(id);
    if (!device) return undefined;
    const roomId = this.storage.deviceSettings.get(id)?.roomId;
    const rooms = new Map<string, Room>();
    const room = roomId ? this.storage.rooms.get(roomId) : undefined;
    if (room) rooms.set(room.id, room);
    return this.apply(device, this.storage.deviceSettings.get(id), rooms);
  }

  private apply(
    device: Device,
    settings: DeviceSettingsRecord | undefined,
    rooms: ReadonlyMap<string, Room>,
  ): Device {
    if (!settings) return device;
    const localRoom = settings.roomId ? rooms.get(settings.roomId) : undefined;
    return {
      ...device,
      alias: settings.alias,
      name: settings.alias ?? device.sourceName,
      favorite: settings.favorite,
      room: localRoom ? { id: localRoom.id, name: localRoom.name } : device.room,
    };
  }
}
