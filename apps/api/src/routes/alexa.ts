import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ALEXA_COMMANDS_MAX,
  ALEXA_NAME_MAX,
  ALEXA_TEXT_MAX,
  API_ALEXA_COMMANDS_PATH,
  API_ALEXA_TEST_PATH,
  type AlexaCommand,
  type AlexaCommandListResponse,
  type AlexaExecutionResult,
} from '@home-control/shared';
import { ApiError, HTTP_STATUS_BY_CODE } from '../errors.js';
import { parseOrThrow } from './validation.js';

const COMMAND_ID = /^ac_[0-9a-f]{12}$/;
const DEVICE_ID = /^dev_[0-9a-f]{16}$/;

const name = z
  .string()
  .trim()
  .min(1, { message: 'must not be empty' })
  .max(ALEXA_NAME_MAX, { message: `must be at most ${ALEXA_NAME_MAX} characters` })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' });

const text = z
  .string()
  .trim()
  .min(1, { message: 'must not be empty' })
  .max(ALEXA_TEXT_MAX, { message: `must be at most ${ALEXA_TEXT_MAX} characters` })
  .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' })
  // The text is spoken to Alexa, never rendered by Home Assistant: refuse anything that looks like a template.
  .refine((value) => !value.includes('{{') && !value.includes('{%'), {
    message: 'must not contain template syntax',
  });

const deviceId = z.string().regex(DEVICE_ID, { message: 'is not a valid device id' });

const createBody = z.object({ name, text, deviceId }).strict();
const updateBody = z
  .object({ name: name.optional(), text: text.optional(), deviceId: deviceId.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'provide at least one field' });
const testBody = z.object({ text, deviceId }).strict();

export function registerAlexaRoutes(app: FastifyInstance): void {
  const { alexa } = app.storage;
  const notFound = () => new ApiError('not_found', 'Alexa command not found');

  const requireEcho = (id: string) => {
    if (!app.alexa.isEcho(id)) {
      throw new ApiError('invalid_params', 'deviceId: must be an Echo known to Home Assistant');
    }
  };

  /** Accepted -> 202; failed -> the status of its cause (like device actions). */
  const reply = (res: FastifyReply, result: AlexaExecutionResult) =>
    res
      .status(
        result.status === 'accepted'
          ? 202
          : (HTTP_STATUS_BY_CODE[result.error?.code ?? 'internal_error'] ?? 502),
      )
      .send(result);

  app.get<{ Reply: AlexaCommandListResponse }>(API_ALEXA_COMMANDS_PATH, async () => ({
    commands: alexa.list(),
  }));

  // Saving never sends anything to Alexa.
  app.post<{ Reply: AlexaCommand }>(API_ALEXA_COMMANDS_PATH, async (request, res) => {
    const input = parseOrThrow(createBody, request.body, 'body');
    if (alexa.count() >= ALEXA_COMMANDS_MAX) {
      throw new ApiError('invalid_params', `Too many commands (maximum ${ALEXA_COMMANDS_MAX})`);
    }
    requireEcho(input.deviceId);
    return res.status(201).send(alexa.create(input));
  });

  app.patch<{ Params: { id: string }; Reply: AlexaCommand }>(
    `${API_ALEXA_COMMANDS_PATH}/:id`,
    async (request) => {
      if (!COMMAND_ID.test(request.params.id)) throw notFound();
      const change = parseOrThrow(updateBody, request.body, 'body');
      if (change.deviceId) requireEcho(change.deviceId);
      const updated = alexa.update(request.params.id, change);
      if (!updated) throw notFound();
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(`${API_ALEXA_COMMANDS_PATH}/:id`, async (request, res) => {
    if (!COMMAND_ID.test(request.params.id) || !alexa.delete(request.params.id)) throw notFound();
    return res.status(204).send();
  });

  // Executes the STORED text of a saved command: the body is ignored, so nothing the client sends can
  // change what is said.
  app.post<{ Params: { id: string } }>(
    `${API_ALEXA_COMMANDS_PATH}/:id/execute`,
    async (request, res) => {
      if (!COMMAND_ID.test(request.params.id)) throw notFound();
      const command = alexa.get(request.params.id);
      if (!command) throw notFound();
      return reply(res, await app.alexa.send(command.deviceId, command.text, command.id));
    },
  );

  // A draft: sent once, stored nowhere.
  app.post(API_ALEXA_TEST_PATH, async (request, res) => {
    const input = parseOrThrow(testBody, request.body, 'body');
    return reply(res, await app.alexa.send(input.deviceId, input.text, null));
  });
}
