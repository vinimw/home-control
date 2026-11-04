import type {
  CustomDevice,
  CustomDeviceAction,
  CustomDeviceExecutionResult,
  CustomDeviceLink,
} from '@home-control/shared';
import type { ApiErrorCode } from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { AlexaCommandService } from '../alexa/service.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { CustomDeviceRecord, Storage } from '../storage/index.js';

export interface CustomDeviceServiceOptions {
  storage: Storage;
  registry: DeviceRegistry;
  alexa: AlexaCommandService;
}

/**
 * Custom cards are only a mapping from two buttons to two saved Alexa commands. Executing one goes
 * through {@link AlexaCommandService} with the STORED text, so it is subject to the same gate, the same
 * Echo checks and the same honest `accepted`/`failed` outcome as running the saved command directly.
 */
export class CustomDeviceService {
  /** `deviceId:action` currently being sent: a second identical request is refused, not queued. */
  private readonly inFlight = new Set<string>();

  constructor(private readonly options: CustomDeviceServiceOptions) {}

  private link(commandId: string | null): CustomDeviceLink {
    if (!commandId) return { commandId: null, commandName: null, status: 'unset' };
    const command = this.options.storage.alexa.get(commandId);
    if (!command) return { commandId, commandName: null, status: 'missing_command' };
    const echo = this.options.registry.get(command.deviceId);
    const status = !echo?.capabilities.includes('voice_command')
      ? 'echo_missing'
      : echo.availability === 'unavailable'
        ? 'echo_unavailable'
        : 'ready';
    return { commandId, commandName: command.name, status };
  }

  view(record: CustomDeviceRecord): CustomDevice {
    const room = record.roomId ? this.options.storage.rooms.get(record.roomId) : undefined;
    const last = record.lastCommand;
    return {
      id: record.id,
      name: record.name,
      favorite: record.favorite,
      room: room ? { id: room.id, name: room.name } : null,
      on: this.link(record.onCommandId),
      off: this.link(record.offCommandId),
      lastCommand: last
        ? {
            action: last.action,
            status: last.status,
            at: last.at,
            ...(last.errorCode
              ? {
                  error: {
                    code: last.errorCode as ApiErrorCode,
                    message: last.errorMessage ?? 'The request failed',
                  },
                }
              : {}),
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  list(): CustomDevice[] {
    return this.options.storage.customDevices.list().map((record) => this.view(record));
  }

  /**
   * Throws an {@link ApiError} when nothing was sent. After the request is made, the outcome is returned
   * (and remembered) as `accepted` or `failed`; it never says what the physical device did.
   */
  async execute(id: string, action: CustomDeviceAction): Promise<CustomDeviceExecutionResult> {
    const { storage, alexa } = this.options;
    const record = storage.customDevices.get(id);
    if (!record) throw new ApiError('not_found', 'Custom device not found');

    const commandId = action === 'on' ? record.onCommandId : record.offCommandId;
    if (!commandId) {
      throw new ApiError('conflict', 'No saved command is mapped to this button');
    }
    const command = storage.alexa.get(commandId);
    if (!command) {
      throw new ApiError('conflict', 'The saved command mapped to this button no longer exists');
    }

    const key = `${id}:${action}`;
    if (this.inFlight.has(key)) {
      throw new ApiError('conflict', 'This command is already being sent');
    }
    this.inFlight.add(key);
    try {
      const result = await alexa.send(command.deviceId, command.text, command.id);
      storage.customDevices.recordCommand(id, {
        action,
        status: result.status,
        at: new Date().toISOString(),
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
      });
      return {
        deviceId: id,
        action,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
        device: this.view(storage.customDevices.get(id)!),
      };
    } finally {
      this.inFlight.delete(key);
    }
  }
}
