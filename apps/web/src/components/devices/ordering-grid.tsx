'use client';

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Item = { id: string; name: string; content: ReactNode };
type Drag = { source: string; target: string | null; pointerId: number; x: number; y: number };

/** Pointer capture works for mouse, pen and touch. Only the dedicated handle starts a gesture. */
export function OrderingGrid({
  items,
  editing,
  disabled,
  onMove,
  room,
  rooms,
  onRoomDrop,
  onDragTarget,
}: {
  items: Item[];
  editing: boolean;
  disabled: boolean;
  onMove: (source: string, target: string) => void;
  room: string;
  rooms: string[];
  onRoomDrop: (source: string, room: string, target?: string) => void;
  onDragTarget: (room: string | null) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ source: string; target: string | null } | null>(null);

  function cancel() {
    drag.current = null;
    setPreview(null);
    onDragTarget(null);
  }

  function locate(x: number, y: number) {
    const element = document.elementFromPoint(x, y);
    const card = element?.closest<HTMLElement>('[data-order-card]');
    const destination = element?.closest<HTMLElement>('[data-order-room]');
    return {
      room: destination?.dataset.orderRoom ?? (card?.parentElement === grid.current ? room : null),
      card: card?.dataset.orderCard ?? null,
    };
  }

  function start(event: PointerEvent<HTMLButtonElement>, source: string) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      source,
      target: source,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setPreview({ source, target: source });
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    const target = locate(current.x, current.y);
    current.target = target.card;
    onDragTarget(target.room);
    setPreview({ source: current.source, target: current.target });
  }

  function drop(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = locate(event.clientX, event.clientY);
    cancel();
    if (disabled || !target.room) return;
    if (target.room !== room) onRoomDrop(current.source, target.room, target.card ?? undefined);
    else if (target.card && target.card !== current.source) onMove(current.source, target.card);
  }

  const dragging = preview !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        drag.current = null;
        setPreview(null);
        onDragTarget(null);
      }
    };
    // Scroll near viewport edges so long room groups remain reorderable on a phone.
    let frame: number;
    const tick = () => {
      const current = drag.current;
      if (current) {
        const edge = 88;
        const speed = current.y < edge ? -8 : current.y > window.innerHeight - edge ? 8 : 0;
        if (speed) window.scrollBy(0, speed);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [dragging, onDragTarget]);

  return (
    <div ref={grid} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          data-order-card={item.id}
          className={cn(
            'min-w-0 rounded-lg',
            editing && 'border border-dashed border-input p-1',
            preview?.source === item.id && 'opacity-60',
            preview?.target === item.id && preview.source !== item.id && 'ring-2 ring-primary',
          )}
        >
          {editing ? (
            <div
              role="group"
              aria-label={`Organizar ${item.name}`}
              className="flex flex-wrap items-center gap-2 p-1"
            >
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Arrastar ${item.name}`}
                title="Arraste para outro cartão ou cômodo. Esc cancela."
                className="touch-none cursor-grab active:cursor-grabbing"
                onPointerDown={(event) => start(event, item.id)}
                onPointerMove={move}
                onPointerUp={drop}
                onPointerCancel={cancel}
                onLostPointerCapture={cancel}
                onClick={(event) => event.preventDefault()}
              >
                <GripVertical aria-hidden />
              </Button>
              <span className="mr-auto text-xs text-muted-foreground">
                {index + 1} de {items.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={disabled || index === 0}
                aria-label={`Mover ${item.name} para antes`}
                onClick={() => onMove(item.id, items[index - 1]!.id)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={disabled || index === items.length - 1}
                aria-label={`Mover ${item.name} para depois`}
                onClick={() => onMove(item.id, items[index + 1]!.id)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                Mover para cômodo
                <select
                  aria-label={`Mover ${item.name} para cômodo`}
                  value=""
                  disabled={disabled}
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onChange={(event) => {
                    if (event.target.value) onRoomDrop(item.id, event.target.value);
                  }}
                >
                  <option value="">Escolher cômodo…</option>
                  {rooms
                    .filter((name) => name !== room)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ) : null}
          {/* Card controls/links cannot receive pointer or keyboard events while organizing. */}
          <div inert={editing}>{item.content}</div>
        </div>
      ))}
    </div>
  );
}
