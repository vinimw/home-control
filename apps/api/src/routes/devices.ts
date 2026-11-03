import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_DEVICES_PATH,
  DEVICE_AVAILABILITIES,
  DEVICE_TYPES,
  type Device,
  type DeviceActionResult,
  type DeviceListResponse,
} from '@home-control/shared';
import { ApiError, HTTP_STATUS_BY_CODE } from '../errors.js';

const DEVICE_ID = /^dev_[0-9a-f]{16}$/;

const listQuery = z
  .object({
    type: z.enum(DEVICE_TYPES).optional(),
    availability: z.enum(DEVICE_AVAILABILITIES).optional(),
    roomId: z.string().max(64).optional(),
  })
  .strict();

export function registerDeviceRoutes(app: FastifyInstance): void {
  app.get<{ Reply: DeviceListResponse }>(API_DEVICES_PATH, async (request) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) =>
        issue.code === 'unrecognized_keys'
          ? `unexpected query param(s): ${issue.keys.join(', ')}`
          : `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new ApiError('bad_request', `Invalid query: ${problems.join('; ')}`);
    }
    const { type, availability, roomId } = parsed.data;

    const devices = app.devices
      .list()
      .filter((d) => !type || d.type === type)
      .filter((d) => !availability || d.availability === availability)
      .filter((d) => !roomId || d.room?.id === roomId);
    return { devices, summary: app.devices.summary() };
  });

  app.get<{ Params: { id: string }; Reply: Device }>(`${API_DEVICES_PATH}/:id`, async (request) => {
    const device = DEVICE_ID.test(request.params.id)
      ? app.devices.get(request.params.id)
      : undefined;
    if (!device) throw new ApiError('not_found', 'Device not found');
    return device;
  });

  app.post<{ Params: { id: string }; Reply: DeviceActionResult }>(
    `${API_DEVICES_PATH}/:id/actions`,
    { bodyLimit: 16 * 1024 },
    async (request, reply) => {
      const result = await app.deviceActions.execute(request.params.id, request.body);
      // Executed and failed: the body keeps the explicit `failed` status, the HTTP code reflects the cause.
      const statusCode =
        result.status === 'confirmed'
          ? 200
          : result.status === 'accepted'
            ? 202
            : HTTP_STATUS_BY_CODE[result.error?.code ?? 'internal_error'];
      return reply.status(statusCode).send(result);
    },
  );
}
