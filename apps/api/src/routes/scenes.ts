import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_SCENES_PATH,
  SCENE_NAME_MAX,
  SCENE_STEPS_MAX,
  SCENES_MAX,
  type Scene,
  type SceneListResponse,
  type SceneRun,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import { parseOrThrow } from './validation.js';

const SCENE_ID = /^sc_[0-9a-f]{12}$/;

const name = z
  .string()
  .trim()
  .min(1, { message: 'must not be empty' })
  .max(SCENE_NAME_MAX, { message: `must be at most ${SCENE_NAME_MAX} characters` })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' });

const step = z
  .object({
    deviceId: z.string().min(1).max(200),
    command: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const steps = z.array(step).min(1).max(SCENE_STEPS_MAX);

const createBody = z.object({ name, steps }).strict();
const updateBody = z
  .object({ name: name.optional(), steps: steps.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field' });

export function registerSceneRoutes(app: FastifyInstance): void {
  const { scenes } = app.storage;
  const notFound = () => new ApiError('not_found', 'Scene not found');

  app.get<{ Reply: SceneListResponse }>(API_SCENES_PATH, async () => ({ scenes: scenes.list() }));

  app.post<{ Reply: Scene }>(API_SCENES_PATH, async (request, reply) => {
    const input = parseOrThrow(createBody, request.body, 'body');
    if (scenes.count() >= SCENES_MAX) {
      throw new ApiError('invalid_params', `Too many scenes (maximum ${SCENES_MAX})`);
    }
    app.scenes.validateSteps(input.steps);
    return reply.status(201).send(scenes.create(input));
  });

  app.patch<{ Params: { id: string }; Reply: Scene }>(`${API_SCENES_PATH}/:id`, async (request) => {
    if (!SCENE_ID.test(request.params.id)) throw notFound();
    const change = parseOrThrow(updateBody, request.body, 'body');
    if (change.steps) app.scenes.validateSteps(change.steps);
    const updated = scenes.update(request.params.id, change);
    if (!updated) throw notFound();
    return updated;
  });

  app.delete<{ Params: { id: string } }>(`${API_SCENES_PATH}/:id`, async (request, reply) => {
    if (!SCENE_ID.test(request.params.id) || !scenes.delete(request.params.id)) throw notFound();
    return reply.status(204).send();
  });

  /**
   * Runs the saved steps. The body is empty on purpose: the client never sends commands here. The response is
   * always 200 with per-step results; `status` says honestly whether everything was confirmed.
   */
  app.post<{ Params: { id: string }; Reply: SceneRun }>(
    `${API_SCENES_PATH}/:id/run`,
    async (request) => {
      if (!SCENE_ID.test(request.params.id)) throw notFound();
      const scene = scenes.get(request.params.id);
      if (!scene) throw notFound();
      return app.scenes.run(scene);
    },
  );
}
