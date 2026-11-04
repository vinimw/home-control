/** Responsive card order. Room membership remains owned by device settings. */
export const API_DEVICE_LAYOUT_PATH = '/device-layout';

export interface DeviceLayout {
  revision: number;
  /** Stable dev_/cd_ ids, including temporarily missing cards. */
  cardIds: string[];
}

export type DeviceLayoutUpdate = DeviceLayout;
