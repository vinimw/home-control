import type { Device, DeviceType } from '@home-control/shared';

export type CategoryId = 'lights' | 'media' | 'climate' | 'scenes' | 'sensors';

export interface Category {
  id: CategoryId;
  label: string;
  types: readonly DeviceType[];
}

/** Display categories. Every canonical device type belongs to exactly one. */
export const CATEGORIES: readonly Category[] = [
  { id: 'lights', label: 'Luzes e tomadas', types: ['light', 'switch'] },
  { id: 'media', label: 'TV e áudio', types: ['tv', 'speaker', 'media_player'] },
  { id: 'climate', label: 'Clima e ambiente', types: ['climate', 'fan', 'cover'] },
  { id: 'scenes', label: 'Cenas e atalhos', types: ['scene', 'script', 'button'] },
  { id: 'sensors', label: 'Sensores', types: ['sensor', 'binary_sensor'] },
];

export function categoryOf(device: Device): CategoryId {
  return CATEGORIES.find((category) => category.types.includes(device.type))?.id ?? 'sensors';
}

export const NO_ROOM_LABEL = 'Sem cômodo';
