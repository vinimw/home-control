'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaActivityResponse } from '@home-control/shared';
import { redirectToLogin } from '@/lib/csrf';

const REFRESH_MS = 5000;

export interface MediaActivityView {
  data: MediaActivityResponse | null;
  /** The last refresh failed: what is shown may be out of date. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/** Refreshes while the page is visible, so the header follows playback without navigation or reload. */
export function useMediaActivity(): MediaActivityView {
  const [data, setData] = useState<MediaActivityResponse | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/media/activity', { cache: 'no-store' });
      if (response.status === 401) redirectToLogin();
      if (!response.ok) throw new Error(String(response.status));
      setData((await response.json()) as MediaActivityResponse);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { data, stale, refresh };
}
