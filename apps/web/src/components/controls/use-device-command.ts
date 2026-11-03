'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceActionResult } from '@home-control/shared';
import { describeError, FALLBACK_ERROR } from '@/lib/messages';

/**
 * What the UI may claim about a command. The ONLY path to `confirmed` is the API answering
 * `status: "confirmed"`; there are no optimistic updates and no simulated success.
 */
export type CommandPhase =
  | { phase: 'idle' }
  | { phase: 'pending' }
  /** The device accepted the command but its effect was not observed (yet). */
  | { phase: 'accepted' }
  | { phase: 'confirmed' }
  | { phase: 'failed'; message: string };

/** Sends a canonical command. Implementations call the devices API and return its result. */
export type ExecuteCommand = (
  command: string,
  params?: Record<string, unknown>,
) => Promise<DeviceActionResult>;

const CONFIRMED_VISIBLE_MS = 3000;
const ACCEPTED_VISIBLE_MS = 8000;

export function useDeviceCommand(execute: ExecuteCommand) {
  const [state, setState] = useState<CommandPhase>({ phase: 'idle' });
  const latestRun = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = null;
  };
  useEffect(() => cancelTimer, []);

  const run = useCallback(
    async (command: string, params?: Record<string, unknown>) => {
      const runId = ++latestRun.current;
      cancelTimer();
      setState({ phase: 'pending' });

      let next: CommandPhase;
      try {
        const result = await execute(command, params);
        next =
          result.status === 'confirmed'
            ? { phase: 'confirmed' }
            : result.status === 'accepted'
              ? { phase: 'accepted' }
              : { phase: 'failed', message: describeError(result.error?.code) };
      } catch {
        // Network error, rejected request or any unexpected failure: never treated as success.
        next = { phase: 'failed', message: FALLBACK_ERROR };
      }

      if (runId !== latestRun.current) return; // a newer command superseded this one
      setState(next);

      const visibleMs =
        next.phase === 'confirmed'
          ? CONFIRMED_VISIBLE_MS
          : next.phase === 'accepted'
            ? ACCEPTED_VISIBLE_MS
            : null;
      if (visibleMs) {
        clearTimer.current = setTimeout(() => setState({ phase: 'idle' }), visibleMs);
      }
    },
    [execute],
  );

  return { state, run, pending: state.phase === 'pending' };
}
