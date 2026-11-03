import { CircleAlert, CircleCheck, Clock, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandPhase } from './use-device-command';

/**
 * Inline status of the last command. The live region is always mounted so screen readers
 * announce changes; the visible text never says "done" unless the device confirmed it.
 */
export function ControlStatus({ state, className }: { state: CommandPhase; className?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn('flex min-h-5 items-center gap-1.5 text-sm', className)}
    >
      {state.phase === 'pending' && (
        <>
          <LoaderCircle
            aria-hidden
            className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
          <span className="text-muted-foreground">Enviando…</span>
        </>
      )}
      {state.phase === 'accepted' && (
        <>
          <Clock aria-hidden className="size-4 text-warning" />
          <span className="text-foreground">Enviado, aguardando confirmação do dispositivo</span>
        </>
      )}
      {state.phase === 'confirmed' && (
        <>
          <CircleCheck aria-hidden className="size-4 text-success" />
          <span className="text-foreground">Confirmado pelo dispositivo</span>
        </>
      )}
      {state.phase === 'failed' && (
        <>
          <CircleAlert aria-hidden className="size-4 text-destructive" />
          <span className="text-foreground">{state.message}</span>
        </>
      )}
    </p>
  );
}
