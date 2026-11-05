import type { ApiErrorPayload } from './errors.js';
import type { DeviceActionStatus } from './actions.js';

export const API_SCENES_PATH = '/scenes';
export const SCENE_NAME_MAX = 60;
export const SCENE_STEPS_MAX = 20;
export const SCENES_MAX = 50;

/** One ordered action: a canonical command of a discovered device. Never a raw Home Assistant call. */
export interface SceneStep {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
}

export interface SceneInput {
  name: string;
  steps: SceneStep[];
}

/**
 * - `confirmed`: every step's expected state was observed.
 * - `accepted`: no step failed, but at least one was not confirmed (yet).
 * - `partial`: some steps worked and some failed or were rejected.
 * - `failed`: no step worked.
 */
export type SceneRunStatus = 'confirmed' | 'accepted' | 'partial' | 'failed';

export interface SceneStepResult {
  index: number;
  deviceId: string;
  command: string;
  status: DeviceActionStatus;
  error?: ApiErrorPayload;
  durationMs: number;
}

export interface SceneRun {
  status: SceneRunStatus;
  at: string;
  steps: SceneStepResult[];
}

export interface Scene {
  id: string;
  name: string;
  steps: SceneStep[];
  createdAt: string;
  updatedAt: string;
  /** The most recent execution, or `null` when it never ran. */
  lastRun: SceneRun | null;
}

export interface SceneListResponse {
  scenes: Scene[];
}
