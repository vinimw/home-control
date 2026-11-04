import type { ApiErrorPayload } from './errors.js';
import type { AlexaExecutionStatus } from './alexa.js';

export const API_CUSTOM_DEVICES_PATH = '/custom-devices';

export const CUSTOM_DEVICE_NAME_MAX = 60;
export const CUSTOM_DEVICES_MAX = 50;

/** The two explicit actions. There is no toggle: the physical state is not known. */
export const CUSTOM_DEVICE_ACTIONS = ['on', 'off'] as const;
export type CustomDeviceAction = (typeof CUSTOM_DEVICE_ACTIONS)[number];

/**
 * Whether one of the two buttons can currently do something. Worked out on every read, so a deleted
 * command or an Echo that went away is visible without losing the card's configuration.
 * - `ready`: a saved command is mapped and its Echo is known and not unavailable.
 * - `unset`: nothing is mapped yet.
 * - `missing_command`: the mapped saved command was deleted.
 * - `echo_missing`: the Echo of the mapped command is not currently known to Home Assistant.
 * - `echo_unavailable`: Home Assistant reports the Echo as unavailable.
 */
export type CustomDeviceLinkStatus =
  'ready' | 'unset' | 'missing_command' | 'echo_missing' | 'echo_unavailable';

export interface CustomDeviceLink {
  /** The mapped saved Alexa command, or `null` when nothing is mapped. Kept even if the command is gone. */
  commandId: string | null;
  /** Name of the saved command, when it still exists. */
  commandName: string | null;
  status: CustomDeviceLinkStatus;
}

/** The last request that was actually sent. It says what was asked, never what the light did. */
export interface CustomDeviceLastCommand {
  action: CustomDeviceAction;
  status: AlexaExecutionStatus;
  at: string;
  error?: ApiErrorPayload;
}

export interface CustomDevice {
  id: string;
  name: string;
  /** Always a light/outlet: shown under "Luzes e tomadas". */
  favorite: boolean;
  room: { id: string; name: string } | null;
  on: CustomDeviceLink;
  off: CustomDeviceLink;
  /** `null` until a command was sent. The physical state is never inferred from it. */
  lastCommand: CustomDeviceLastCommand | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomDeviceListResponse {
  devices: CustomDevice[];
}

export interface CustomDeviceInput {
  name: string;
  roomId: string | null;
  favorite: boolean;
  onCommandId: string | null;
  offCommandId: string | null;
}

export interface CustomDeviceExecuteInput {
  action: CustomDeviceAction;
}

export interface CustomDeviceExecutionResult {
  deviceId: string;
  action: CustomDeviceAction;
  status: AlexaExecutionStatus;
  error?: ApiErrorPayload;
  /** The card as it is after this request, so the client does not need a second round trip. */
  device: CustomDevice;
}
