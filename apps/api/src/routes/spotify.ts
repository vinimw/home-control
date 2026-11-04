import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  API_SPOTIFY_PATH,
  type SpotifyConnectResponse,
  type SpotifyDevicesResponse,
  type SpotifyPlaybackResponse,
  type SpotifyPlaylistsResponse,
  type SpotifyStatus,
} from '@home-control/shared';
import { ApiError } from '../errors.js';

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
}
