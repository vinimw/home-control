'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceLayout, DeviceRoomMoveResult } from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from '@/lib/csrf';

/** Replace only visible slots. Hidden/missing ids keep their exact positions and relative order. */
export function moveVisibleCard(
  full: string[],
  visible: string[],
  source: string,
  target: string,
): string[] {
  const from = visible.indexOf(source);
  const to = visible.indexOf(target);
  if (from < 0 || to < 0 || from === to) return full;
  const moved = [...visible];
  moved.splice(from, 1);
  moved.splice(to, 0, source);
  const slots = new Set(visible);
  let index = 0;
  return full.map((id) => (slots.has(id) ? moved[index++]! : id));
}

async function requestLayout(change?: DeviceLayout): Promise<DeviceLayout> {
  const response = await fetch('/api/device-layout', {
    method: change ? 'PATCH' : 'GET',
    cache: 'no-store',
    headers: change ? { 'content-type': 'application/json', ...csrfHeaders() } : {},
    body: change ? JSON.stringify(change) : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw new Error('Layout request failed');
  return (await response.json()) as DeviceLayout;
}

export function useDeviceLayout(initial: DeviceLayout | null) {
  const [layout, setLayout] = useState<DeviceLayout | null>(initial);
  const [status, setStatus] = useState<'ready' | 'saving' | 'loading' | 'error'>(
    initial ? 'ready' : 'loading',
  );
  // Locks immediately, before React renders: two gestures can never use the same revision locally.
  const busy = useRef(!initial);
  const reload = useCallback(async () => {
    busy.current = true;
    setStatus('loading');
    try {
      setLayout(await requestLayout());
      setStatus('ready');
      busy.current = false;
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    if (!initial) void reload();
  }, [initial, reload]);

  const save = useCallback(
    async (cardIds: string[]) => {
      if (busy.current || !layout) return;
      busy.current = true;
      setStatus('saving');
      // This is user-owned layout metadata, never an optimistic device state change.
      setLayout({ ...layout, cardIds });
      try {
        setLayout(await requestLayout({ revision: layout.revision, cardIds }));
        setStatus('ready');
        busy.current = false;
      } catch {
        // A lost response may already have committed. Keep the proposal visible and block further saves
        // until GET reconciles the authoritative order, rather than inventing a successful rollback.
        setStatus('error');
      }
    },
    [layout],
  );

  const moveRoom = useCallback(
    async (
      cardIds: string[],
      cardId: string,
      roomId: string,
      apply: (result: DeviceRoomMoveResult) => void,
    ) => {
      if (busy.current || !layout) return;
      busy.current = true;
      setStatus('saving');
      try {
        const response = await fetch('/api/device-layout/move', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ revision: layout.revision, cardIds, cardId, roomId }),
          signal: AbortSignal.timeout(12_000),
        });
        if (response.status === 401) redirectToLogin();
        if (!response.ok) throw new Error('Room move failed');
        const result = (await response.json()) as DeviceRoomMoveResult;
        setLayout(result.layout);
        apply(result);
        setStatus('ready');
        busy.current = false;
      } catch {
        // Room assignment and order must be reloaded together after an ambiguous response.
        setStatus('error');
      }
    },
    [layout],
  );

  return { layout, status, save, reload, moveRoom };
}
