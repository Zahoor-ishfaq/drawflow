import { useRef } from 'react';
import { Image, Square, Type } from 'lucide-react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';

const KIND_ICONS = { text: Type, shape: Square, svg: Image, image: Image } as const;

interface ClipProps {
  element: DrawElement;
  pxPerSec: number;
  rowIndex: number;
  rowCount: number;
  /** convert a clientX into timeline seconds */
  tFromClientX: (clientX: number) => number;
}

type Drag =
  | { mode: 'move'; grabOffset: number; startRow: number; startClientY: number }
  | { mode: 'resize' };

export function Clip({ element: el, pxPerSec, rowIndex, rowCount, tFromClientX }: ClipProps) {
  const selected = useStore((s) => s.selectedId === el.id);
  const { select, updateElement, reorder } = useStore.getState();
  const dragRef = useRef<Drag | null>(null);
  const Icon = KIND_ICONS[el.kind];

  const beginDrag = (e: React.PointerEvent, drag: Drag) => {
    e.stopPropagation();
    select(el.id);
    dragRef.current = drag;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = tFromClientX(e.clientX);
    if (drag.mode === 'move') {
      updateElement(el.id, { startTime: Math.max(0, t - drag.grabOffset) });
      // vertical reorder: crossing row boundaries moves the layer
      const rowDelta = Math.round((e.clientY - drag.startClientY) / 28);
      const targetRow = Math.min(Math.max(drag.startRow + rowDelta, 0), rowCount - 1);
      const targetZ = rowCount - 1 - targetRow;
      if (targetZ !== el.zIndex) reorder(el.id, targetZ);
    } else {
      updateElement(el.id, { drawDuration: Math.max(0.1, t - el.startTime) });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div
      className={
        'group absolute top-1 flex h-5 items-center gap-1 overflow-hidden rounded-[4px] border pl-1.5 pr-2 ' +
        (selected
          ? 'border-accent bg-accent-weak'
          : 'border-[#47474f] bg-gradient-to-b from-[#3a3a42] to-[#333339] hover:border-[#55555f]')
      }
      style={{
        left: el.startTime * pxPerSec,
        width: Math.max(el.drawDuration * pxPerSec, 14),
        cursor: 'grab',
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        beginDrag(e, {
          mode: 'move',
          grabOffset: tFromClientX(e.clientX) - el.startTime,
          startRow: rowIndex,
          startClientY: e.clientY,
        });
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <Icon size={11} className="shrink-0 text-t3" />
      <span className="truncate text-[11px] leading-none text-t1">{el.label}</span>
      <div
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-transparent group-hover:bg-[#55555f]"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          beginDrag(e, { mode: 'resize' });
        }}
      />
    </div>
  );
}
