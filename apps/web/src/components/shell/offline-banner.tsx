'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Shown when the browser reports no network. The app has no offline mode: nothing is cached or queued, so
 * commands cannot work and what is on screen may be out of date. It says exactly that.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground"
    >
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <strong>Sem conexão.</strong> Nenhum comando será enviado e o que você vê pode estar
        desatualizado. Reconecte à rede da sua casa para controlar os dispositivos.
      </p>
    </div>
  );
}
