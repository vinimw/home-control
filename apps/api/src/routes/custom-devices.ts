import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_CUSTOM_DEVICES_PATH,
  CUSTOM_DEVICE_ACTIONS,
  CUSTOM_DEVICE_NAME_MAX,
  CUSTOM_DEVICES_MAX,
  type CustomDevice,
  type CustomDeviceListResponse,
} from '@home-control/shared';
import { ApiError, HTTP_STATUS_BY_CODE } from '../errors.js';
import { parseOrThrow } from './validation.js';

const CUSTOM_ID = /^cd_[0-9a-f]{12}$/;
const COMMAND_ID = /^ac_[0-9a-f]{12}$/;
const ROOM_ID = /^rm_[0-9a-f]{12}$/;

const name = z
  .string()
  .trim()
  .min(1, { message: 'must not be empty' })
  .max(CUSTOM_DEVICE_NAME_MAX, { message: `must be at most ${CUSTOM_DEVICE_NAME_MAX} characters` })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' });

const commandId = z.string().regex(COMMAND_ID, { message: 'is not a valid command id' }).nullable();
const roomId = z.string().regex(ROOM_ID, { message: 'is not a valid room id' }).nullable();

const createBody = z
  .object({
    name,
    roomId: roomId.default(null),
    favorite: z.boolean().default(false),
    onCommandId: commandId.default(null),
    offCommandId: commandId.default(null),
  })
  .strict();
const updateBody = z
  .object({
    name: name.optional(),
    roomId: roomId.optional(),
    favorite: z.boolean().optional(),
    onCommandId: commandId.optional(),
    offCommandId: commandId.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field' });
// The only thing a client chooses when executing is which of the two buttons it pressed.
const executeBody = z.object({ action: z.enum(CUSTOM_DEVICE_ACTIONS) }).strict();

export function registerCustomDeviceRoutes(app: FastifyInstance): void {
  const { customDevices, alexa, rooms } = app.storage;
  const notFound = () => new ApiError('not_found', 'Custom device not found');

  /** A mapping must point at a command that exists NOW; later deletion is tolerated and shown. */
  const checkReferences = (change: {
    roomId?: string | null;
    onCommandId?: string | null;
    offCommandId?: string | null;
  }) => {
    if (change.roomId && !rooms.get(change.roomId)) {
      throw new ApiError('invalid_params', 'roomId: the room does not exist');
    }
    for (const [field, value] of [
      ['onCommandId', change.onCommandId],
      ['offCommandId', change.offCommandId],
    ] as const) {
      if (value && !alexa.get(value)) {
        throw new ApiError('invalid_params', `${field}: the saved command does not exist`);
      }
    }
  };

  app.get<{ Reply: CustomDeviceListResponse }>(API_CUSTOM_DEVICES_PATH, async () => ({
    devices: app.customDevices.list(),
  }));

  // Saving only stores the mapping. It never sends anything to Alexa.
  app.post<{ Reply: CustomDevice }>(API_CUSTOM_DEVICES_PATH, async (request, res) => {
    const input = parseOrThrow(createBody, request.body, 'body');
    if (customDevices.count() >= CUSTOM_DEVICES_MAX) {
      throw new ApiError(
        'invalid_params',
        `Too many custom devices (maximum ${CUSTOM_DEVICES_MAX})`,
      );
    }
    checkReferences(input);
    return res.status(201).send(app.customDevices.view(customDevices.create(input)));
  });

  app.patch<{ Params: { id: string }; Reply: CustomDevice }>(
    `${API_CUSTOM_DEVICES_PATH}/:id`,
    async (request) => {
      if (!CUSTOM_ID.test(request.params.id)) throw notFound();
      const change = parseOrThrow(updateBody, request.body, 'body');
      checkReferences(change);
      const updated = customDevices.update(request.params.id, change);
      if (!updated) throw notFound();
      return app.customDevices.view(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(`${API_CUSTOM_DEVICES_PATH}/:id`, async (request, res) => {
    if (!CUSTOM_ID.test(request.params.id) || !customDevices.delete(request.params.id)) {
      throw notFound();
    }
    return res.status(204).send();
  });

  app.post<{ Params: { id: string } }>(
    `${API_CUSTOM_DEVICES_PATH}/:id/execute`,
    async (request, res) => {
      if (!CUSTOM_ID.test(request.params.id)) throw notFound();
      const { action } = parseOrThrow(executeBody, request.body, 'body');
      const result = await app.customDevices.execute(request.params.id, action);
      // Accepted -> 202; failed -> the status of its cause, like device actions and Alexa commands.
      return res
        .status(
          result.status === 'accepted'
            ? 202
            : (HTTP_STATUS_BY_CODE[result.error?.code ?? 'internal_error'] ?? 502),
        )
        .send(result);
    },
  );
}
