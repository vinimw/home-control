'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * Shows the pattern for destructive actions: the action lives on the item's own row, asks for
 * confirmation in a dialog, and states what will happen. Nothing is deleted here.
 */
export function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <>
      <Card>
        <div className="flex min-h-14 items-center gap-2 pl-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Sala de exemplo</p>
            <p className="text-xs text-muted-foreground">
              Demonstração: nada é excluído de verdade.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Excluir a sala de exemplo"
            onClick={() => {
              setResult(null);
              setOpen(true);
            }}
          >
            <Trash2 aria-hidden className="text-destructive" />
          </Button>
        </div>
      </Card>
      {result ? (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        destructive
        title="Excluir a sala de exemplo?"
        description="Os dispositivos dela ficam sem cômodo. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onCancel={() => {
          setOpen(false);
          setResult('Cancelado. Nada foi alterado.');
        }}
        onConfirm={() => {
          setOpen(false);
          setResult('Confirmado na demonstração. Nada foi excluído de verdade.');
        }}
      />
    </>
  );
}
