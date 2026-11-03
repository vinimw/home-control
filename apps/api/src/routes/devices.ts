import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_DEVICE_EVENTS_PATH,
  API_DEVICES_PATH,
  DEVICE_AVAILABILITIES,
  DEVICE_TYPES,
  type Device,
  type DeviceActionResult,
  type DeviceListResponse,
  type DeviceSettingsUpdate,
} from '@home-control/shared';
import { ApiError, HTTP_STATUS_BY_CODE } from '../errors.js';
import { parseOrThrow } from './validation.js';

const DEVICE_ID = /^dev_[0-9a-f]{16}$/;

const listQuery = z
  .object({
    type: z.enum(DEVICE_TYPES).optional(),
    availability: z.enum(DEVICE_AVAILABILITIES).optional(),
    roomId: z.string().max(64).optional(),
    favorite: z.enum(['true', 'false']).optional(),
  })
  .strict();

const alias = z
  .string()
  .trim()
  .max(60, { message: 'must be at most 60 characters' })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' })
  // An empty alias means "remove my alias".
  .transform((value) => (value === '' ? null : value));

const settingsBody = z
  .object({
    alias: alias.nullable().optional(),
    favorite: z.boolean().optional(),
    roomId: z.string().max(64).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field' });

const MAX_STREAMS = 50;
const HEARTBEAT_MS = 15_000;
/** A client that stops reading must not make the API buffer without limit. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function registerDeviceRoutes(app: FastifyInstance): void {
  const streams = new Set<() => void>(); // each entry closes one open stream
  app.addHook('onClose', async () => {
    for (const close of [...streams]) close();
  });

  /** Server-Sent Events: live device changes. Registered before `/devices/:id` so `events` is not read as an id. */
  app.get(API_DEVICE_EVENTS_PATH, (request, reply) => {
    if (streams.size >= MAX_STREAMS) {
      throw new ApiError('too_many_requests', 'Too many open event streams');
    }

    reply.hijack();
    const { raw } = reply;
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Tell reverse proxies (nginx) not to buffer the stream.
      'x-accel-buffering': 'no',
    });

    let unsubscribe = () => {};
    let heartbeat: NodeJS.Timeout | null = null;
    const close = (): void => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe();
      streams.delete(close);
      if (!raw.destroyed && !raw.writableEnded) raw.end();
    };
    const send = (event: string, data: unknown): void => {
      if (raw.destroyed || raw.writableEnded) return;
      if (raw.writableLength > MAX_BUFFERED_BYTES) {
        close();
        return;
      }
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    streams.add(close);
    // Tells the browser to wait 3 s before reconnecting, then announces the stream.
    raw.write('retry: 3000\n\n');
    send('ready', { serverTime: new Date().toISOString() });
    unsubscribe = app.deviceEvents.subscribe((message) => send(message.event, message.data));
    // Comment lines keep idle connections alive through proxies and let the client notice a dead link.
    heartbeat = setInterval(() => {
      if (!raw.destroyed && !raw.writableEnded) raw.write(': ping\n\n');
    }, HEARTBEAT_MS);
    heartbeat.unref();

    request.raw.on('close', close);
    raw.on('error', close);
  });

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
    const { type, availability, roomId, favorite } = parsed.data;

    const devices = app.catalog
      .list()
      .filter((d) => !type || d.type === type)
      .filter((d) => !availability || d.availability === availability)
      .filter((d) => !roomId || d.room?.id === roomId)
      .filter((d) => favorite === undefined || d.favorite === (favorite === 'true'));
    return { devices, summary: app.devices.summary() };
  });

  app.get<{ Params: { id: string }; Reply: Device }>(`${API_DEVICES_PATH}/:id`, async (request) => {
    const device = DEVICE_ID.test(request.params.id)
      ? app.catalog.get(request.params.id)
      : undefined;
    if (!device) throw new ApiError('not_found', 'Device not found');
    return device;
  });

  /** Alias, favorite and room of a device. Persisted by the API; never sent to Home Assistant. */
  app.patch<{ Params: { id: string }; Reply: Device }>(
    `${API_DEVICES_PATH}/:id/settings`,
    { bodyLimit: 4 * 1024 },
    async (request) => {
      const id = request.params.id;
      // The device must currently exist, so typos cannot create orphan rows.
      if (!DEVICE_ID.test(id) || !app.devices.get(id))
        throw new ApiError('not_found', 'Device not found');

      const change: DeviceSettingsUpdate = parseOrThrow(settingsBody, request.body, 'body');
      if (change.roomId && !app.storage.rooms.get(change.roomId)) {
        throw new ApiError('invalid_params', 'The room does not exist');
      }
      app.storage.deviceSettings.update(id, change);
      app.deviceEvents.device(id);
      return app.catalog.get(id)!;
    },
  );

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
