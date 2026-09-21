import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { TOURS } from '../../lib/tours';
import { useTourStore } from '../../store/tourStore';

type Rect = { x: number; y: number; w: number; h: number };
const CARD_W = 320;
const GAP = 14;

/** Where the target is right now (it may appear a moment after the step opens a panel). */
function useTargetRect(target: string | undefined, step: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      const key = next ? `${next.x | 0},${next.y | 0},${next.w | 0},${next.h | 0}` : '';
      if (key !== last) { last = key; setRect(next); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, step]);
  return rect;
}

/** Spotlight + tip card for the running tour. Esc, the ✕ or "Skip" cancel it. */
export function TourOverlay() {
  const { tourId, step, next, back, stop } = useTourStore();
  const tour = TOURS.find((t) => t.id === tourId);
  const current = tour?.steps[step];
  const rect = useTargetRect(current?.target, step);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); stop(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, next, back, stop]);

  if (!tour || !current) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 6;
  const spot = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : null;

  // card placement: beside the target on the side with room, else centred
  let side: 'right' | 'left' | 'bottom' | 'top' | 'center' = 'center';
  let left = (vw - CARD_W) / 2, top = vh * 0.3;
  const cardH = 230 + (current.keys?.length ?? 0) * 22;
  if (spot) {
    const room = { right: vw - (spot.x + spot.w), left: spot.x, bottom: vh - (spot.y + spot.h), top: spot.y };
    if (room.right >= CARD_W + GAP) side = 'right';
    else if (room.left >= CARD_W + GAP) side = 'left';
    else if (room.bottom >= cardH + GAP) side = 'bottom';
    else if (room.top >= cardH + GAP) side = 'top';
    const cy = spot.y + spot.h / 2, cx = spot.x + spot.w / 2;
    if (side === 'right') { left = spot.x + spot.w + GAP; top = cy - cardH / 2; }
    if (side === 'left') { left = spot.x - GAP - CARD_W; top = cy - cardH / 2; }
    if (side === 'bottom') { left = cx - CARD_W / 2; top = spot.y + spot.h + GAP; }
    if (side === 'top') { left = cx - CARD_W / 2; top = spot.y - GAP - cardH; }
    left = Math.max(8, Math.min(left, vw - CARD_W - 8));
    top = Math.max(8, Math.min(top, vh - cardH - 8));
  }
  const arrow = spot && side !== 'center' ? (() => {
    const cy = Math.max(top + 24, Math.min(spot.y + spot.h / 2, top + cardH - 24));
    const cx = Math.max(left + 24, Math.min(spot.x + spot.w / 2, left + CARD_W - 24));
    if (side === 'right') return { left: left - 8, top: cy - 8, rot: 45 };
    if (side === 'left') return { left: left + CARD_W - 8, top: cy - 8, rot: 45 };
    if (side === 'bottom') return { left: cx - 8, top: top - 8, rot: 45 };
    return { left: cx - 8, top: top + cardH - 8, rot: 45 };
  })() : null;

  return (
    <div className="fixed inset-0 z-[90]" style={{ pointerEvents: 'none' }} data-tour-overlay>
      {/* dim everything except the target; clicks still go through to the page */}
      <svg className="absolute inset-0 h-full w-full" width={vw} height={vh}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="#fff" />
            {spot && <rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="10" fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(16,22,35,0.42)" mask="url(#tour-mask)" />
        {spot && <rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="10" fill="none" stroke="#0d9d97" strokeWidth="2" />}
      </svg>

      {arrow && <div className="absolute h-4 w-4 bg-[#1c1c21]" style={{ left: arrow.left, top: arrow.top, transform: `rotate(${arrow.rot}deg)` }} />}

      <div
        role="dialog"
        aria-label={`${tour.title}: tip ${step + 1} of ${tour.steps.length}`}
        className="absolute rounded-2xl bg-[#1c1c21] p-4 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
        style={{ left, top, width: CARD_W, pointerEvents: 'auto' }}
      >
        <button type="button" className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" onClick={stop} title="End the tour (Esc)" aria-label="End the tour">
          <X size={14} />
        </button>
        <div className="text-[10.5px] font-semibold tracking-[0.12em] text-white/50 uppercase">Tip {step + 1} of {tour.steps.length} · {tour.title}</div>
        <div className="mt-1 pr-6 text-[15px] font-bold leading-snug">{current.title}</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">{current.body}</p>
        {current.keys && current.keys.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1">
            {current.keys.map((k) => (
              <div key={k.keys} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-white/75">{k.action}</span>
                <kbd className="shrink-0 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] whitespace-nowrap text-white">{k.keys}</kbd>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-1.5">
          {tour.steps.map((_, i) => <span key={i} className={'h-1.5 w-1.5 rounded-full ' + (i === step ? 'bg-white' : 'bg-white/30')} />)}
          <div className="flex-1" />
          <button type="button" className="mr-1 text-[12px] text-white/50 hover:text-white" onClick={stop}>Skip</button>
          <button type="button" disabled={step === 0} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30" onClick={back}>
            <ArrowLeft size={13} /> Back
          </button>
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-3 text-[12.5px] font-semibold text-[#1c1c21] hover:bg-white/90" onClick={next} autoFocus>
            {step + 1 === tour.steps.length ? 'Done' : 'Next'} {step + 1 < tour.steps.length && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
