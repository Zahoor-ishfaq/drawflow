import { memo, useRef } from 'react';
import { Camera, Hand, Hourglass, Pencil } from 'lucide-react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { measurePaths } from '../../lib/drawing';
import { pathColors } from '../../lib/renderFrame';
import { clamp } from '../../lib/time';

const CARD_W = 104;
const CONNECTOR_W = 26;
const SLOT_WIDTH = CARD_W + CONNECTOR_W;

/** Mini preview of an element's artwork. */
const ElementThumb = memo(function ElementThumb({ el }: { el: DrawElement }) {
  if (el.kind === 'image' && el.image) {
    return <img src={el.image.src} alt="" className="h-full w-full object-contain" draggable={false} />;
  }
  const b = measurePaths(el.paths).bbox;
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  const pad = Math.max(w, h) * 0.1;
  return (
    <svg
      viewBox={`${b.x - pad} ${b.y - pad} ${w + pad * 2} ${h + pad * 2}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {el.paths.map((d, i) => {
        const { fill, stroke } = pathColors(el, i);
        return (
          <path
            key={i}
            d={d}
            fill={fill}
            fillRule={el.fillRule ?? 'nonzero'}
            stroke={stroke}
            strokeWidth={el.pathFills ? Math.max(w, h) / 400 : Math.max(w, h) / 36}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
});

function Card({ el, index, count }: { el: DrawElement; index: number; count: number }) {
  const selected = useStore((s) => s.selectedId === el.id);
  const currentTime = useStore((s) => s.currentTime);
  const paperDark = useStore((s) => s.project.paper === 'chalkboard');
  const drag = useRef<{ startX: number; curIndex: number } | null>(null);

  const end = el.startTime + el.drawDuration;
  const active = currentTime >= el.startTime && currentTime < end + el.pauseAfter;
  const progress = clamp((currentTime - el.startTime) / Math.max(el.drawDuration, 1e-6), 0, 1);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = useStore.getState();
    s.pause();
    s.select(el.id);
    drag.current = { startX: e.clientX, curIndex: index };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const target = clamp(d.curIndex + Math.round((e.clientX - d.startX) / SLOT_WIDTH), 0, count - 1);
    if (target !== d.curIndex) {
      useStore.getState().reorder(el.id, target);
      d.curIndex = target;
      d.startX = e.clientX;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div className="flex items-start">
      {index > 0 && (
        <div className="flex h-[62px] flex-col items-center justify-center" style={{ width: CONNECTOR_W }}>
          <div className="h-px w-full bg-[#c9d0da]" />
          <span
            className="tabular mt-1 text-[9.5px] text-t3"
            title="Transition: camera travel time into this element"
          >
            {el.transitionIn > 0 && index > 0 ? `${el.transitionIn.toFixed(1)}s` : ''}
          </span>
        </div>
      )}
      <div
        className="shrink-0 cursor-grab select-none"
        style={{ width: CARD_W }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          const s = useStore.getState();
          s.pause();
          s.setCameraView(true);
          s.setTime(el.startTime);
        }}
        title={`${el.label} — drag to reorder, double-click to jump here`}
      >
        <div
          className={
            'df-ui-anim relative h-[62px] overflow-hidden rounded-xl border-2 p-1.5 transition-colors ' +
            (paperDark ? 'bg-[#2c473d] ' : 'bg-white ') +
            (selected
              ? 'border-accent shadow-[0_2px_10px_rgba(13,157,151,0.25)]'
              : active
                ? 'border-[#8fd4d1]'
                : 'border-line hover:border-[#c3cad4]')
          }
        >
          <ElementThumb el={el} />
          {el.camera !== 'auto' && (
            <span className="absolute top-1 right-1 rounded-md bg-[#1d2430]/60 p-0.5 text-white" title="Custom camera framing">
              <Camera size={9} />
            </span>
          )}
          {el.style !== 'draw' && (
            <span className="absolute top-1 left-1 rounded-md bg-[#1d2430]/60 px-1 text-[8.5px] font-medium text-white">
              {el.style}
            </span>
          )}
          {active && (
            <span
              className="absolute bottom-0 left-0 h-[3px] bg-accent"
              style={{ width: `${progress * 100}%` }}
            />
          )}
        </div>
        <div className={'mt-1 truncate text-center text-[11px] ' + (selected ? 'font-medium text-t1' : 'text-t2')}>
          {index + 1}. {el.label}
        </div>
        <div className="tabular mt-0.5 flex items-center justify-center gap-1.5 text-[9.5px] text-t3">
          <span className="flex items-center gap-0.5" title="Animate (draw) time">
            {el.style === 'draw' ? <Hand size={9} /> : <Pencil size={9} />}
            {el.drawDuration.toFixed(1)}
          </span>
          <span className="flex items-center gap-0.5" title="Pause after">
            <Hourglass size={9} />
            {el.pauseAfter.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** VideoScribe-style strip: elements as thumbnails in play order. */
export function FilmStrip() {
  const ordered = useSequence();

  if (ordered.length === 0) {
    return (
      <div className="flex h-[104px] items-center justify-center text-[12.5px] text-t3">
        Elements you add will appear here in the order they are drawn
      </div>
    );
  }

  return (
    <div className="flex h-[104px] items-start overflow-x-auto overflow-y-hidden px-1 pb-1">
      {ordered.map((el, i) => (
        <Card key={el.id} el={el} index={i} count={ordered.length} />
      ))}
    </div>
  );
}
