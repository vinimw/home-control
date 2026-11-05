import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_DEVICE_LAYOUT_PATH,
  type DeviceLayout,
  type DeviceRoomMoveResult,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import { parseOrThrow } from './validation.js';

// Fits the web relay's 16 KB body limit, with room for JSON and the revision.
const fields = z
  .object({
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    cardIds: z.array(z.string().regex(/^(?:dev_[0-9a-f]{16}|cd_[0-9a-f]{12})$/)).max(500),
  })
  .strict();
const uniqueIds = (value: DeviceLayout) => new Set(value.cardIds).size === value.cardIds.length;
const body = fields.refine(uniqueIds, {
  message: 'cardIds must be unique',
});

const moveBody = fields
  .extend({
    cardId: z.string().regex(/^(?:dev_[0-9a-f]{16}|cd_[0-9a-f]{12})$/),
    roomId: z.string().min(1).max(128),
  })
  .refine(uniqueIds, { message: 'cardIds must be unique' })
  .refine((value) => value.cardIds.includes(value.cardId), {
    message: 'cardIds must include the moved card',
  });

export function registerDeviceLayoutRoutes(app: FastifyInstance): void {
  app.get<{ Reply: DeviceLayout }>(API_DEVICE_LAYOUT_PATH, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return app.storage.layout.get();
  });

  app.post<{ Reply: DeviceRoomMoveResult }>(`${API_DEVICE_LAYOUT_PATH}/move`, async (request) => {
    const change = parseOrThrow(moveBody, request.body, 'body');
    const device = change.cardId.startsWith('dev_') ? app.catalog.get(change.cardId) : undefined;
    const custom = app.storage.customDevices.get(change.cardId);
    if (!device && !custom) throw new ApiError('not_found', 'Card not found');
    const localRoom = app.storage.rooms.get(change.roomId);
    const area =
      localRoom ?? app.catalog.list().find((item) => item.room?.id === change.roomId)?.room;
    if (!area) throw new ApiError('invalid_params', 'Room no longer exists');

    const saved = app.storage.layout.save(change, () => {
      // Home Assistant areas are read-only. Materialize a local room with the same name, reusing an
      // existing match; only this card gets an override. No provider command or area edit is sent.
      const localize = (room: { id: string; name: string }) => {
        const existing =
          app.storage.rooms.get(room.id) ??
          app.storage.rooms
            .list()
            .find(
              (item) =>
                item.name.toLocaleLowerCase('pt-BR') ===
                room.name.trim().toLocaleLowerCase('pt-BR'),
            );
        if (existing) return existing;
        if (app.storage.rooms.count() >= 100)
          throw new ApiError('invalid_params', 'Too many rooms');
        const name = z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[^\p{Cc}]*$/u)
          .safeParse(room.name);
        if (!name.success)
          throw new ApiError(
            'invalid_params',
            'Create a local room with a name up to 40 characters',
          );
        return app.storage.rooms.create(name.data);
      };
      const destination = localize(area);
      // Keep an empty source area available as a destination after its last card leaves.
      if (device?.room) localize(device.room);
      if (device) app.storage.deviceSettings.update(device.id, { roomId: destination.id });
      else app.storage.customDevices.update(custom!.id, { roomId: destination.id });
    });
    if (!saved) throw new ApiError('conflict', 'Layout changed. Reload before moving again.');
    if (device) app.deviceEvents.device(device.id);
    return {
      layout: saved,
      device: device ? app.catalog.get(device.id)! : null,
      custom: custom ? app.customDevices.view(app.storage.customDevices.get(custom.id)!) : null,
      rooms: app.storage.rooms.list(),
    };
  });

  app.patch<{ Reply: DeviceLayout }>(API_DEVICE_LAYOUT_PATH, async (request, reply) => {
    const change = parseOrThrow(body, request.body, 'body');
    const saved = app.storage.layout.save(change);
    if (!saved) throw new ApiError('conflict', 'Layout changed. Reload before reordering again.');
    reply.header('cache-control', 'no-store');
    return saved;
  });
}
