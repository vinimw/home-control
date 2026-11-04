import type { AlexaExecutionResult } from '@home-control/shared';
import { ApiError, toErrorPayload } from '../errors.js';
import type { HomeAssistantService } from '../homeassistant/service.js';
import type { Logger } from '../homeassistant/types.js';
import type { DeviceRegistry } from '../devices/registry.js';

export interface AlexaCommandServiceOptions {
  registry: DeviceRegistry;
  homeAssistant: HomeAssistantService;
  logger: Logger;
  /** Same master switch as device actions: a text command can do anything Alexa allows. */
  enabled: () => boolean;
}

/**
 * Sends literal text to an Echo through the one fixed Home Assistant action
 * (`alexa_devices.send_text_command`). The text is data: it cannot choose another service, another
 * target, or be rendered as a template.
 */
export class AlexaCommandService {
  constructor(private readonly options: AlexaCommandServiceOptions) {}

  /**
   * Throws an {@link ApiError} when nothing was sent. Once the call is made, a failure is returned as a
   * `failed` result; success is only ever `accepted`.
   */
  async send(
    deviceId: string,
    text: string,
    commandId: string | null,
  ): Promise<AlexaExecutionResult> {
    const { registry, homeAssistant, logger } = this.options;
    if (!this.options.enabled()) {
      throw new ApiError('actions_disabled', 'Device actions are disabled on the server');
    }

    const device = registry.get(deviceId);
    const binding = registry.resolve(deviceId);
    if (!device || !binding)
      throw new ApiError('not_found', 'The Echo for this command was not found');
    if (!device.capabilities.includes('voice_command') || !binding.haDeviceId) {
      throw new ApiError('unsupported_action', 'This device cannot receive Alexa commands');
    }
    if (device.availability === 'unavailable') {
      throw new ApiError('device_unavailable', 'The Echo is unavailable and cannot be controlled');
    }

    const base = { commandId, deviceId };
    try {
      await homeAssistant.rest.callService('alexa_devices', 'send_text_command', {
        device_id: binding.haDeviceId,
        text_command: text,
      });
    } catch (error) {
      const payload = toErrorPayload(error);
      logger.warn({ deviceId, commandId, code: payload.code }, 'alexa command failed');
      return { ...base, status: 'failed', error: payload };
    }
    // The text itself is never logged: it can contain anything the user says to Alexa.
    logger.info({ deviceId, commandId }, 'alexa command sent');
    return { ...base, status: 'accepted' };
  }

  /** True when `deviceId` is a known Echo (used when saving, to reject a bad target early). */
  isEcho(deviceId: string): boolean {
    return this.options.registry.get(deviceId)?.capabilities.includes('voice_command') ?? false;
  }
}
