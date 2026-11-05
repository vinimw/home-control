import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { API_ROOMS_PATH, type Room, type RoomListResponse } from '@home-control/shared';
import { ApiError } from '../errors.js';
import { DuplicateRoomError } from '../storage/index.js';
import { parseOrThrow } from './validation.js';

const ROOM_ID = /^rm_[0-9a-f]{12}$/;
const MAX_ROOMS = 100;

const name = z
  .string()
  .trim()
  .min(1, { message: 'must not be empty' })
  .max(40, { message: 'must be at most 40 characters' })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' });

const createBody = z.object({ name }).strict();
const updateBody = z
  .object({ name: name.optional(), sortOrder: z.number().int().min(0).max(10_000).optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field' });

const orderBody = z.object({ ids: z.array(z.string().regex(ROOM_ID)).max(MAX_ROOMS) }).strict();

export function registerRoomRoutes(app: FastifyInstance): void {
  const { rooms } = app.storage;
  const notFound = () => new ApiError('not_found', 'Room not found');

  app.get<{ Reply: RoomListResponse }>(API_ROOMS_PATH, async () => ({ rooms: rooms.list() }));

  app.post<{ Reply: Room }>(API_ROOMS_PATH, async (request, reply) => {
    const { name: roomName } = parseOrThrow(createBody, request.body, 'body');
    if (rooms.count() >= MAX_ROOMS) {
      throw new ApiError('invalid_params', `Too many rooms (maximum ${MAX_ROOMS})`);
    }
    try {
      return reply.status(201).send(rooms.create(roomName));
    } catch (error) {
      if (error instanceof DuplicateRoomError) throw new ApiError('conflict', error.message);
      throw error;
    }
  });

  /** Saves the room order. Rooms not listed keep their relative order after the listed ones. */
  app.put<{ Reply: RoomListResponse }>(`${API_ROOMS_PATH}/order`, async (request) => {
    const { ids } = parseOrThrow(orderBody, request.body, 'body');
    const result = rooms.reorder(ids);
    app.deviceEvents.resync('rooms');
    return { rooms: result };
  });

  app.patch<{ Params: { id: string }; Reply: Room }>(`${API_ROOMS_PATH}/:id`, async (request) => {
    if (!ROOM_ID.test(request.params.id)) throw notFound();
    const change = parseOrThrow(updateBody, request.body, 'body');
    try {
      const room = rooms.update(request.params.id, change);
      if (!room) throw notFound();
      app.deviceEvents.resync('rooms');
      return room;
    } catch (error) {
      if (error instanceof DuplicateRoomError) throw new ApiError('conflict', error.message);
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>(`${API_ROOMS_PATH}/:id`, async (request, reply) => {
    if (!ROOM_ID.test(request.params.id) || !rooms.delete(request.params.id)) throw notFound();
    app.deviceEvents.resync('rooms');
    return reply.status(204).send();
  });
}
