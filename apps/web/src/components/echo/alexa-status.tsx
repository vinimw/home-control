import { CircleAlert, Clock, LoaderCircle } from 'lucide-react';

export type AlexaPhase =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'accepted' }
  | { phase: 'failed'; message: string };

/**
 * Outcome of sending text to Alexa. There is no "done" state on purpose: Home Assistant accepting the
 * request does not tell us what Alexa did, so the text always asks the user to look at the Echo.
 */
export function AlexaStatus({ state }: { state: AlexaPhase }) {
  return (
    <p role="status" aria-live="polite" className="flex items-start gap-1.5 text-sm empty:hidden">
      {state.phase === 'pending' && (
        <>
          <LoaderCircle
            aria-hidden
            className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
          <span className="text-muted-foreground">Enviando para a Alexa…</span>
        </>
      )}
      {state.phase === 'accepted' && (
        <>
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Enviado. O Home Assistant aceitou, mas não é possível saber o que a Alexa fez: olhe e
            escute o Echo para conferir.
          </span>
        </>
      )}
      {state.phase === 'failed' && (
        <>
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{state.message}</span>
        </>
      )}
    </p>
  );
}
