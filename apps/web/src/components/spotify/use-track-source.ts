'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpotifySavedResponse, SpotifyTrack, SpotifyTrackPage } from '@home-control/shared';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';

export type TrackSource =
  { kind: 'search'; query: string } | { kind: 'saved' } | { kind: 'playlist'; id: string };

function pathOf(source: TrackSource, offset: number): string {
  switch (source.kind) {
    case 'search':
      return `library/search?${new URLSearchParams({ q: source.query, offset: String(offset) })}`;
    case 'saved':
      return `library/saved?offset=${offset}`;
    case 'playlist':
      return `library/playlists/${source.id}/tracks?offset=${offset}`;
  }
}

/**
 * A paginated list of tracks from Spotify. Pages are appended ("Carregar mais"); saving or removing a track
 * updates the row with what Spotify reported afterwards, never with a guess.
 */
export function useTrackSource(source: TrackSource | null) {
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<Extract<SpotifyResult<unknown>, { ok: false }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const generation = useRef(0);
  const key = source ? JSON.stringify(source) : null;

  const load = useCallback(
    async (offset: number) => {
      if (!source) return;
      const mine = ++generation.current;
      setLoading(true);
      setError(null);
      const result = await spotifyRequest<SpotifyTrackPage>(pathOf(source, offset));
      if (mine !== generation.current) return; // a newer request replaced this one
      setLoading(false);
      if (!result.ok) return setError(result);
      setTracks((current) =>
        offset === 0 ? result.data.tracks : [...current, ...result.data.tracks],
      );
      setTotal(result.data.total);
      setNextOffset(result.data.nextOffset);
    },
    // `key` stands for the source value.
    [key],
  );

  useEffect(() => {
    setTracks([]);
    setTotal(0);
    setNextOffset(null);
    setError(null);
    if (key) void load(0);
    else generation.current++;
  }, [key, load]);

  const toggleSaved = useCallback(async (track: SpotifyTrack) => {
    setSavingId(track.id);
    const result = await spotifyRequest<SpotifySavedResponse>(
      `library/saved/${track.id}`,
      track.saved ? 'DELETE' : 'PUT',
    );
    setSavingId(null);
    if (result.ok) {
      setTracks((current) =>
        current.map((t) => (t.id === track.id ? { ...t, saved: result.data.saved } : t)),
      );
      return result.data.saved === !track.saved
        ? null
        : 'O Spotify não confirmou a mudança. Tente de novo.';
    }
    return result.message;
  }, []);

  return {
    tracks,
    total,
    loading,
    error,
    savingId,
    hasMore: nextOffset !== null,
    loadMore: () => nextOffset !== null && load(nextOffset),
    reload: () => load(0),
    toggleSaved,
  };
}
