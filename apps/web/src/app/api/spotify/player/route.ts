import { API_SPOTIFY_PLAYER_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

/** Spotify player state, read through Home Assistant. */
export function GET(request: Request) {
  return relayJson(request, API_SPOTIFY_PLAYER_PATH, 'GET');
}
