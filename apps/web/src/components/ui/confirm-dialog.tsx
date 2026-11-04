'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Say what will happen and to what: "Excluir a sala Quarto? Os dispositivos ficam sem cômodo." */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for destructive actions. It is a native modal `<dialog>`: focus is trapped, Esc closes it
 * and the page behind is inert, with no extra dependency.
 *
 * - Phones: a bottom sheet, so the buttons sit where the thumb is.
 * - Focus starts on the SAFE choice (cancel), so an accidental Enter never destroys anything.
 * - The destructive button is never the default and never the first in reading order.
 *
 * Put the action that opens this next to the item it affects (a row button or menu), never as a loose
 * button at the end of the page.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Esc: let the parent decide, so the state and the dialog never disagree.
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      // A click on the dimmed area (the dialog element itself) cancels.
      onClick={(event) => {
        if (event.target === ref.current && !pending) onCancel();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <div id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
