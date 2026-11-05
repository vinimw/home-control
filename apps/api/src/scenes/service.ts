import type {
  Scene,
  SceneRun,
  SceneRunStatus,
  SceneStep,
  SceneStepResult,
} from '@home-control/shared';
import { ApiError, toErrorPayload } from '../errors.js';
import { validateParams } from '../devices/actions/params.js';
import type { DeviceActionService } from '../devices/actions/service.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { Logger } from '../homeassistant/types.js';
import type { SceneRepository } from '../storage/scenes.js';

export interface SceneServiceOptions {
  scenes: SceneRepository;
  registry: DeviceRegistry;
  actions: DeviceActionService;
  logger: Logger;
  /** Longest a single step may take before it is recorded as failed. */
  stepTimeoutMs?: number;
}

/**
 * Validates and runs scenes. A step can only be a canonical command that the device advertises right now
 * (checked when saving and again when running); the Home Assistant call is chosen by the device action
 * service, so a scene can never run an arbitrary Home Assistant service.
 */
export class SceneService {
  private readonly running = new Set<string>();
  private readonly stepTimeoutMs: number;

  constructor(private readonly options: SceneServiceOptions) {
    this.stepTimeoutMs = options.stepTimeoutMs ?? 15_000;
  }

  /** Throws `invalid_params` naming the step when it cannot work with the device as it is now. */
  validateSteps(steps: SceneStep[]): void {
    steps.forEach((step, index) => {
      const where = `steps.${index}`;
      const device = this.options.registry.get(step.deviceId);
      if (!device) throw new ApiError('invalid_params', `${where}: the device does not exist`);
      const spec = device.commands.find((command) => command.name === step.command);
      if (!spec) {
        throw new ApiError(
          'invalid_params',
          `${where}: this device does not support "${step.command}"`,
        );
      }
      try {
        validateParams(spec, step.params);
      } catch (error) {
        throw new ApiError('invalid_params', `${where}: ${toErrorPayload(error).message}`);
      }
    });
  }

  /** Runs the steps in order. A failing step is recorded and the next one still runs (partial failure). */
  async run(scene: Scene): Promise<SceneRun> {
    if (this.running.has(scene.id)) {
      throw new ApiError('conflict', 'This scene is already running');
    }
    this.running.add(scene.id);
    try {
      const steps: SceneStepResult[] = [];
      for (const [index, step] of scene.steps.entries()) {
        steps.push(await this.runStep(index, step));
      }
      const run: SceneRun = { status: summarize(steps), at: new Date().toISOString(), steps };
      this.options.scenes.recordRun(scene.id, run);
      return run;
    } finally {
      this.running.delete(scene.id);
    }
  }

  private async runStep(index: number, step: SceneStep): Promise<SceneStepResult> {
    const base = { index, deviceId: step.deviceId, command: step.command };
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.options.actions.execute(step.deviceId, { command: step.command, params: step.params }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ApiError('timeout', 'The step took too long and was not confirmed')),
            this.stepTimeoutMs,
          );
        }),
      ]);
      return {
        ...base,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
        durationMs: elapsed(),
      };
    } catch (error) {
      const payload = toErrorPayload(error);
      this.options.logger.warn({ ...base, code: payload.code }, 'scene step failed');
      return { ...base, status: 'failed', error: payload, durationMs: elapsed() };
    } finally {
      clearTimeout(timer);
    }
  }
}

function summarize(steps: SceneStepResult[]): SceneRunStatus {
  const failed = steps.filter((s) => s.status === 'failed').length;
  if (failed === steps.length && steps.length > 0) return 'failed';
  if (failed > 0) return 'partial';
  return steps.every((s) => s.status === 'confirmed') ? 'confirmed' : 'accepted';
}
