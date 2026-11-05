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

export const SCENE_PRESET_KEYS = ['cinema', 'good_night'] as const;
export type ScenePresetKey = (typeof SCENE_PRESET_KEYS)[number];

/** A template step as it resolves today: it is `available` only if the device and command exist right now. */
export interface ScenePresetStep {
  label: string;
  available: boolean;
  /** Why the step is left out, in plain language. Present when `available` is false. */
  reason?: string;
  step?: SceneStep;
}

/** `GET /scenes/presets` */
export interface ScenePreset {
  key: ScenePresetKey;
  name: string;
  description: string;
  /** A scene with this name already exists. */
  installed: boolean;
  steps: ScenePresetStep[];
}

export interface ScenePresetListResponse {
  presets: ScenePreset[];
}

/** `POST /scenes/presets/:key/install`: the scene is a normal, editable scene. */
export interface ScenePresetInstallResponse {
  scene: Scene;
  /** Steps left out because the device or command is not available; they never block the scene. */
  omitted: Array<{ label: string; reason: string }>;
}
