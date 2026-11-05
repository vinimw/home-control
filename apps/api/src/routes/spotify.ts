import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_SPOTIFY_PATH,
  API_SPOTIFY_CONTROL_PATH,
  API_SPOTIFY_LIBRARY_PATH,
  SPOTIFY_SEARCH_PAGE_MAX,
  SPOTIFY_TRACKS_PAGE_MAX,
  type SpotifySavedResponse,
  type SpotifyTrackPage,
  API_SPOTIFY_PLAYER_PATH,
  type SpotifyControlResult,
  type SpotifyControlState,
  type SpotifyPlayerResult,
  type SpotifyPlayerState,
  type SpotifyConfigResponse,
  type SpotifyConnectResponse,
  type SpotifyTestResult,
  type SpotifyDevicesResponse,
  type SpotifyPlaybackResponse,
  type SpotifyPlaylistsResponse,
  type SpotifyStatus,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import { playerCommandBody, playerPlaylistBody, playerSourceBody } from '../spotify/ha-player.js';

const configBody = z
  .object({
    clientId: z.string().trim().min(1).max(128),
    redirectUri: z.string().trim().min(1).max(300),
  })
  .strict();

const deviceId = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
const commandBody = z
  .object({ command: z.enum(['play', 'pause', 'next', 'previous']), deviceId: deviceId.optional() })
  .strict();
const transferBody = z.object({ deviceId, play: z.boolean().default(true) }).strict();
const playlistBody = z
  .object({ playlistId: z.string().regex(/^[A-Za-z0-9]{1,64}$/), deviceId: deviceId.optional() })
  .strict();

const spotifyId = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(SPOTIFY_TRACKS_PAGE_MAX).default(20),
});
const searchQuery = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\p{Cc}]*$/u),
    offset: z.coerce.number().int().min(0).max(1000).default(0),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SPOTIFY_SEARCH_PAGE_MAX)
      .default(SPOTIFY_SEARCH_PAGE_MAX),
  })
  .strict();
const trackBody = z
  .object({
    trackId: spotifyId,
    contextUri: z
      .string()
      .regex(/^spotify:playlist:[A-Za-z0-9]{1,64}$/)
      .optional(),
    deviceId: z
      .string()
      .regex(/^[A-Za-z0-9]{1,64}$/)
      .optional(),
  })
  .strict();

const callbackQuery = z
  .object({
    code: z.string().max(2048).optional(),
    state: z.string().max(256).optional(),
    error: z.string().max(100).optional(),
  })
  .passthrough();

export function registerSpotifyRoutes(app: FastifyInstance): void {
  app.get<{ Reply: SpotifyStatus }>(`${API_SPOTIFY_PATH}/status`, async () => app.spotify.status());

  /** Starts the connection. Needs a session + CSRF; the browser is then sent to Spotify. */
  app.post<{ Reply: SpotifyConnectResponse }>(`${API_SPOTIFY_PATH}/connect`, async () =>
    app.spotify.beginAuthorization(),
  );

  /**
   * Where Spotify sends the browser back. It carries no session cookie (it may even be another host name), so
   * it is reachable without one and is protected by the single-use `state` this server issued. It never
   * returns tokens or error details: it only redirects to the settings page with a short outcome.
   */
  app.get(`${API_SPOTIFY_PATH}/callback`, async (request, reply) => {
    const parsed = callbackQuery.safeParse(request.query);
    const { code, state, error } = parsed.success ? parsed.data : {};
    const outcome = async (): Promise<string> => {
      if (error) return error === 'access_denied' ? 'denied' : 'error';
      if (!code || !state) return 'error';
      try {
        await app.spotify.completeAuthorization(code, state);
        return 'connected';
      } catch (failure) {
        request.log.warn(
          { code: failure instanceof ApiError ? failure.code : 'internal_error' },
          'spotify authorization failed',
        );
        return 'error';
      }
    };
    return reply.redirect(`/settings?spotify=${await outcome()}`, 302);
  });

  /** Saves the Spotify app registration (Client ID + callback). Overrides the environment. */
  app.put<{ Reply: SpotifyConfigResponse }>(`${API_SPOTIFY_PATH}/config`, async (request) => {
    const parsed = configBody.safeParse(request.body);
    if (!parsed.success) throw new ApiError('bad_request', 'Invalid request body');
    return app.spotify.saveConfig(parsed.data);
  });

  /** Forgets the saved registration; the server environment (if any) applies again. */
  app.delete<{ Reply: SpotifyConfigResponse }>(`${API_SPOTIFY_PATH}/config`, async () =>
    app.spotify.clearConfig(),
  );

  /** Read-only check of the whole connection. Always 200 with per-check results. */
  app.post<{ Reply: SpotifyTestResult }>(`${API_SPOTIFY_PATH}/test`, async () =>
    app.spotify.test(),
  );

  app.post(`${API_SPOTIFY_PATH}/disconnect`, async (_request, reply) => {
    app.spotify.disconnect();
    return reply.status(204).send();
  });

  app.get<{ Reply: SpotifyPlaylistsResponse }>(`${API_SPOTIFY_PATH}/playlists`, async () =>
    app.spotify.playlists(),
  );
  app.get<{ Reply: SpotifyDevicesResponse }>(`${API_SPOTIFY_PATH}/devices`, async () =>
    app.spotify.devices(),
  );
  app.get<{ Reply: SpotifyPlaybackResponse }>(`${API_SPOTIFY_PATH}/playback`, async () =>
    app.spotify.playback(),
  );

  // Personal library through the Spotify Web API: search, saved tracks, playlist tracks, save/remove.
  const query = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ApiError('bad_request', 'Invalid query');
    return parsed.data;
  };
  app.get<{ Reply: SpotifyTrackPage }>(`${API_SPOTIFY_LIBRARY_PATH}/search`, async (request) => {
    const { q, offset, limit } = query(searchQuery, request.query);
    return app.spotify.searchTracks(q, offset, limit);
  });
  app.get<{ Reply: SpotifyTrackPage }>(`${API_SPOTIFY_LIBRARY_PATH}/saved`, async (request) => {
    const { offset, limit } = query(pageQuery.strict(), request.query);
    return app.spotify.savedTracks(offset, limit);
  });
  app.get<{ Params: { id: string }; Reply: SpotifyTrackPage }>(
    `${API_SPOTIFY_LIBRARY_PATH}/playlists/:id/tracks`,
    async (request) => {
      const id = query(spotifyId, request.params.id);
      const { offset, limit } = query(pageQuery.strict(), request.query);
      return app.spotify.playlistTracks(id, offset, limit);
    },
  );
  for (const [method, save] of [
    ['PUT', true],
    ['DELETE', false],
  ] as const) {
    app.route<{ Params: { id: string }; Reply: SpotifySavedResponse }>({
      method,
      url: `${API_SPOTIFY_LIBRARY_PATH}/saved/:id`,
      handler: async (request) =>
        app.spotify.setTrackSaved(query(spotifyId, request.params.id), save),
    });
  }

  // Direct playback control through the Spotify Web API (no Home Assistant needed).
  app.get<{ Reply: SpotifyControlState }>(`${API_SPOTIFY_CONTROL_PATH}/state`, async () =>
    app.spotify.controlState(),
  );
  app.post<{ Reply: SpotifyControlResult }>(
    `${API_SPOTIFY_CONTROL_PATH}/command`,
    async (request) => {
      const { command, deviceId: target } = parseBody(commandBody, request.body);
      return app.spotify.control(command, target);
    },
  );
  app.post<{ Reply: SpotifyControlResult }>(
    `${API_SPOTIFY_CONTROL_PATH}/transfer`,
    async (request) => {
      const { deviceId: target, play } = parseBody(transferBody, request.body);
      return app.spotify.transfer(target, play);
    },
  );
  app.post<{ Reply: SpotifyControlResult }>(
    `${API_SPOTIFY_CONTROL_PATH}/track`,
    async (request) => {
      const { trackId, contextUri, deviceId: target } = parseBody(trackBody, request.body);
      return app.spotify.playTrack(trackId, contextUri, target);
    },
  );
  app.post<{ Reply: SpotifyControlResult }>(
    `${API_SPOTIFY_CONTROL_PATH}/playlist`,
    async (request) => {
      const { playlistId, deviceId: target } = parseBody(playlistBody, request.body);
      return app.spotify.playPlaylist(playlistId, target);
    },
  );

  // Playback control through Home Assistant's Spotify integration, not a direct Spotify connection.
  app.get<{ Reply: SpotifyPlayerState }>(API_SPOTIFY_PLAYER_PATH, async () =>
    app.spotifyPlayer.state(),
  );
  app.post<{ Reply: SpotifyPlayerResult }>(`${API_SPOTIFY_PLAYER_PATH}/command`, async (request) =>
    app.spotifyPlayer.command(parseBody(playerCommandBody, request.body).command),
  );
  app.post<{ Reply: SpotifyPlayerResult }>(`${API_SPOTIFY_PLAYER_PATH}/source`, async (request) =>
    app.spotifyPlayer.selectSource(parseBody(playerSourceBody, request.body).source),
  );
  app.post<{ Reply: SpotifyPlayerResult }>(`${API_SPOTIFY_PLAYER_PATH}/playlist`, async (request) =>
    app.spotifyPlayer.playPlaylist(parseBody(playerPlaylistBody, request.body).playlistId),
  );
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('bad_request', 'Invalid request body');
  return parsed.data;
}
