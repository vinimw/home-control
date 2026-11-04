import type { Device } from './devices.js';
import type { CustomDevice } from './custom-devices.js';
import type { Room } from './settings.js';

/** Responsive card order. Room membership remains owned by device settings. */
export const API_DEVICE_LAYOUT_PATH = '/device-layout';

export interface DeviceLayout {
  revision: number;
  /** Stable dev_/cd_ ids, including temporarily missing cards. */
  cardIds: string[];
}

export type DeviceLayoutUpdate = DeviceLayout;

/** One atomic change to card order and local room membership. */
export interface DeviceRoomMove extends DeviceLayout {
  cardId: string;
  /** A saved local room id or a currently discovered Home Assistant area id. */
  roomId: string;
}

export interface DeviceRoomMoveResult {
  layout: DeviceLayout;
  device: Device | null;
  custom: CustomDevice | null;
  rooms: Room[];
}
