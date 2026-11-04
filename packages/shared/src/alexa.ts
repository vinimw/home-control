import type { ApiErrorPayload } from './errors.js';

export const API_ALEXA_COMMANDS_PATH = '/alexa/commands';
export const API_ALEXA_TEST_PATH = '/alexa/test';

/** Bounds shared by the API (which enforces them) and the web form (which only mirrors them). */
export const ALEXA_NAME_MAX = 60;
export const ALEXA_TEXT_MAX = 200;
export const ALEXA_COMMANDS_MAX = 100;

/** A command the user wrote: literal text Alexa will interpret as if it were spoken. */
export interface AlexaCommand {
  id: string;
  name: string;
  /** Sent word for word to the Echo. Never a Home Assistant service, never a template. */
  text: string;
  /** The Echo (canonical device id) the text is sent to. */
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlexaCommandListResponse {
  commands: AlexaCommand[];
}

export interface AlexaCommandInput {
  name: string;
  text: string;
  deviceId: string;
}

/** `POST /alexa/test`: a draft that is sent once and never stored. */
export interface AlexaTestInput {
  text: string;
  deviceId: string;
}

/**
 * - `accepted`: Home Assistant took the request. That is ALL it proves: whether Alexa understood it, or
 *   what it did, cannot be observed from here.
 * - `failed`: the request did not reach Alexa; see `error`.
 * There is deliberately no `confirmed`.
 */
export type AlexaExecutionStatus = 'accepted' | 'failed';

export interface AlexaExecutionResult {
  status: AlexaExecutionStatus;
  /** The saved command, or `null` for a draft test. */
  commandId: string | null;
  deviceId: string;
  error?: ApiErrorPayload;
}
