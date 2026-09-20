import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { drawEnd, emphasisWindow, exitWindow, slotEnd } from '../../lib/timing';
import { collectSnapTargets, snapTime } from '../../lib/snapping';
import { clamp } from '../../lib/time';
import type { DrawElement } from '../../types';

type Handle = 'start' | 'draw' | 'pause';
type Drag = { id: string; handle: Handle | 'move'; startX: number; snap: DrawElement; index: number; targets: number[] };

const SCENE_COLORS = ['#0d9d97', '#5b7cfa', '#e0722f', '#8b5cf6', '#10b981', '#ec4899'];

/**
 * Elements on a real time axis: transition gap, draw part, emphasis, pause,
 * and any exit. Drag the body to reorder, the edges to retime.
 */
export function ElementTrack({ pxPerSec, width }: { pxPerSec: number; width: number }) {
  const ordered = useSequence();
  const selectedIds = useStore((s) => s.selectedIds);
  const currentTime = useStore((s) => s.currentTime);
  const scenes = useStore((s) => s.project.scenes ?? []);
  const drag = useRef<Drag | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const visible = ordered.filter((e) => !e.hidden);

  const begin = (e: React.PointerEvent, el: DrawElement, handle: Drag['handle'], index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    if (e.shiftKey || e.ctrlKey || e.metaKey) s.toggleSelect(el.id);
    else if (!s.selectedIds.includes(el.id)) s.select(el.id);
    const targets = collectSnapTargets({
      elements: s.elements, clips: s.audioClips, markers: s.project.markers ?? [],
      playhead: s.currentTime, excludeElementIds: [el.id], pxPerSec, duration: s.project.duration,
    });
    drag.current = { id: el.id, handle, startX: e.clientX, snap: { ...el }, index, targets };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || pxPerSec <= 0) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    const s = useStore.getState();
    const el = d.snap;
    if (d.handle === 'move') {
      // reorder: the block follows the cursor across the other blocks' centres
      const cursorT = el.startTime + dt + (slotEnd(el) - el.startTime) / 2;
      const others = visible.filter((x) => x.id !== el.id);
      let target = others.findIndex((x) => cursorT < (x.startTime + slotEnd(x)) / 2);
      if (target === -1) target = others.length;
      const curIndex = visible.findIndex((x) => x.id === el.id);
      if (target !== curIndex) {
        s.reorder(el.id, target);
        d.startX = e.clientX;
        // the store has a fresh state object now — re-read the moved element
        d.snap = { ...(useStore.getState().elements.find((x) => x.id === el.id) ?? el) };
      }
      return;
    }
    if (d.handle === 'start') {
      // the transition gap before the element
      const raw = el.startTime + dt;
      const { t, snapped } = snapTime(raw, d.targets, pxPerSec);
      setSnapLine(snapped);
      const prevEnd = el.startTime - el.transitionIn;
      s.updateElement(el.id, { transitionIn: clamp(t - prevEnd, 0, 10) });
    } else if (d.handle === 'draw') {
      const raw = drawEnd(el) + dt;
      const { t, snapped } = snapTime(raw, d.targets, pxPerSec);
      setSnapLine(snapped);
      s.updateElement(el.id, { drawDuration: clamp(t - el.startTime, 0.1, 60) });
    } else {
      const raw = slotEnd(el) + dt;
      const { t, snapped } = snapTime(raw, d.targets, pxPerSec);
      setSnapLine(snapped);
      const base = slotEnd(el) - el.pauseAfter;
      s.updateElement(el.id, { pauseAfter: clamp(t - base, 0, 30) });
    }
  };

  const end = (e: React.PointerEvent) => {
    drag.current = null;
    setSnapLine(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const sceneIndex = (id?: string) => Math.max(0, scenes.findIndex((sc) => sc.id === id));

  return (
    <div
      className="relative h-9 overflow-hidden rounded-lg border border-line bg-panel2"
      style={{ width }}
      onPointerDown={() => useStore.getState().select(null)}
    >
      {visible.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11.5px] text-t3">
          Elements — drag edges to retime, drag blocks to reorder
        </div>
      )}
      {visible.map((el, i) => {
        const selected = selectedIds.includes(el.id);
        const start = el.startTime;
        const dEnd = drawEnd(el);
        const sEnd = slotEnd(el);
        const emph = emphasisWindow(el);
        const exit = exitWindow(el);
        const color = scenes.length ? SCENE_COLORS[sceneIndex(el.sceneId) % SCENE_COLORS.length] : '#0d9d97';
        const left = start * pxPerSec;
        const w = Math.max(6, (sEnd - start) * pxPerSec);
        return (
          <div key={el.id}>
            {/* transition gap */}
            {i > 0 && el.transitionIn > 0 && !el.withPrevious && (
              <div
                className="absolute top-3 h-3 border-t border-b border-dashed"
                style={{ left: (start - el.transitionIn) * pxPerSec, width: el.transitionIn * pxPerSec, borderColor: color, opacity: 0.5 }}
              />
            )}
            <div
              className={'absolute top-1 bottom-1 cursor-grab rounded-md border-2 ' + (selected ? 'z-10 shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : '')}
              style={{ left, width: w, borderColor: selected ? '#1d2430' : color, background: `${color}22` }}
              title={`${el.label} — ${start.toFixed(1)}s → ${sEnd.toFixed(1)}s · drag to reorder`}
              onPointerDown={(e) => begin(e, el, 'move', i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onDoubleClick={(e) => { e.stopPropagation(); useStore.getState().focusOn(el.id); }}
            >
              {/* draw part */}
              <div className="absolute inset-y-0 left-0 rounded-l" style={{ width: Math.max(2, (dEnd - start) * pxPerSec - 2), background: color, opacity: 0.55 }} />
              {emph && (
                <div className="absolute inset-y-0" style={{ left: (emph.start - start) * pxPerSec, width: (emph.end - emph.start) * pxPerSec, background: `repeating-linear-gradient(90deg, ${color}66 0 3px, transparent 3px 6px)` }} />
              )}
              <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center truncate text-[10px] font-medium text-t1" style={{ maxWidth: w - 12 }}>
                {i + 1}. {el.label}
              </span>
              {/* handles */}
              {i > 0 && !el.withPrevious && (
                <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-black/10" title="Transition (camera move) before this element"
                  onPointerDown={(e) => begin(e, el, 'start', i)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
              )}
              <div className="absolute inset-y-0 w-2 -translate-x-1/2 cursor-ew-resize hover:bg-black/10" style={{ left: (dEnd - start) * pxPerSec }} title="Drawing time"
                onPointerDown={(e) => begin(e, el, 'draw', i)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
              <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/10" title="Pause after"
                onPointerDown={(e) => begin(e, el, 'pause', i)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
            </div>
            {exit && (
              <div
                className="pointer-events-none absolute top-2.5 h-4 rounded border border-dashed"
                style={{ left: exit.start * pxPerSec, width: Math.max(4, (exit.end - exit.start) * pxPerSec), borderColor: color, background: `repeating-linear-gradient(135deg, ${color}33 0 2px, transparent 2px 5px)` }}
                title={`${el.label} leaves`}
              />
            )}
          </div>
        );
      })}
      {snapLine !== null && (
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff4d8d]" style={{ left: snapLine * pxPerSec }} />
      )}
      <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: currentTime * pxPerSec }} />
    </div>
  );
}
