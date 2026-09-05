import { memo, useRef } from 'react';
import type { DrawElement } from '../../types';
import { sequenceOrder, useStore } from '../../store/useStore';
import { measurePaths } from '../../lib/drawing';
import { clamp } from '../../lib/time';

const SLOT_WIDTH = 118; // card width + gap, used for drag-reorder math

/** Mini preview of an element's artwork. */
const ElementThumb = memo(function ElementThumb({ el }: { el: DrawElement }) {
  const b = measurePaths(el.paths).bbox;
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  const pad = Math.max(w, h) * 0.1;
  const showFill = el.fillColor !== 'none';
  return (
    <svg
      viewBox={`${b.x - pad} ${b.y - pad} ${w + pad * 2} ${h + pad * 2}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {el.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={showFill ? el.fillColor : 'none'}
          stroke={el.strokeColor}
          strokeWidth={Math.max(w, h) / 36}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
});

function Card({
  el, index, count,
}: { el: DrawElement; index: number; count: number }) {
  const selected = useStore((s) => s.selectedId === el.id);
  const currentTime = useStore((s) => s.currentTime);
  const drag = useRef<{ startX: number; curIndex: number } | null>(null);

  const end = el.startTime + el.drawDuration;
  const active = currentTime >= el.startTime && currentTime < end;
  const progress = active ? (currentTime - el.startTime) / Math.max(el.drawDuration, 1e-6) : 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    useStore.getState().select(el.id);
    drag.current = { startX: e.clientX, curIndex: index };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const target = clamp(d.curIndex + Math.round((e.clientX - d.startX) / SLOT_WIDTH), 0, count - 1);
    if (target !== d.curIndex) {
      useStore.getState().moveInSequence(el.id, target);
      d.curIndex = target;
      d.startX = e.clientX;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div
      className="w-[110px] shrink-0 cursor-grab select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        useStore.getState().pause();
        useStore.getState().setTime(el.startTime);
      }}
      title={`${el.label} — drag to reorder, double-click to jump here`}
    >
      <div
        className={
          'df-ui-anim relative h-[62px] overflow-hidden rounded-xl border-2 bg-white p-1.5 transition-colors ' +
          (selected
            ? 'border-accent shadow-[0_2px_10px_rgba(13,157,151,0.25)]'
            : active
              ? 'border-[#8fd4d1]'
              : 'border-line hover:border-[#c3cad4]')
        }
      >
        <ElementThumb el={el} />
        <span className="tabular absolute right-1 bottom-1 rounded-md bg-[#1d2430]/70 px-1 py-px text-[9.5px] leading-[1.4] font-medium text-white">
          {el.drawDuration.toFixed(1)}s
        </span>
        {active && (
          <span
            className="absolute bottom-0 left-0 h-[3px] bg-accent"
            style={{ width: `${clamp(progress, 0, 1) * 100}%` }}
          />
        )}
      </div>
      <div
        className={
          'mt-1 truncate text-center text-[11px] ' + (selected ? 'font-medium text-t1' : 'text-t2')
        }
      >
        {index + 1}. {el.label}
      </div>
    </div>
  );
}

/** VideoScribe-style filmstrip: elements as thumbnails in play order. */
export function FilmStrip() {
  const elements = useStore((s) => s.elements);
  const ordered = sequenceOrder(elements);

  if (ordered.length === 0) {
    return (
      <div className="flex h-[92px] items-center justify-center text-[12.5px] text-t3">
        Elements you add will appear here in play order
      </div>
    );
  }

  return (
    <div className="flex h-[92px] items-start gap-2 overflow-x-auto overflow-y-hidden px-1 pb-1">
      {ordered.map((el, i) => (
        <Card key={el.id} el={el} index={i} count={ordered.length} />
      ))}
    </div>
  );
}
