import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clamp, formatRulerLabel } from '../../lib/time';
import { collectSnapTargets, snapTime } from '../../lib/snapping';
import type { Marker } from '../../types';

const MARKER_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

/** Tick spacing (seconds) that keeps labels roughly 80 px apart. */
function tickStep(pxPerSec: number): { major: number; minor: number } {
  const target = 80 / Math.max(pxPerSec, 1e-6);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find((s) => s >= target) ?? 300;
  return { major, minor: major / (major >= 1 ? 5 : 2) };
}

/** Time ruler: seek by dragging, marker flags (drag to move, click to edit). */
export function TimeRuler({ pxPerSec, width }: { pxPerSec: number; width: number }) {
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.project.duration);
  const markers = useStore((s) => s.project.markers ?? []);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const timeAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || pxPerSec <= 0) return 0;
    return clamp((clientX - rect.left) / pxPerSec, 0, duration);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    s.setCameraView(true); // scrubbing shows what the video will show
    s.setTime(timeAt(e.clientX));
    const onMove = (ev: PointerEvent) => useStore.getState().setTime(timeAt(ev.clientX));
    const onUp = () => window.removeEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const onMarkerDown = (e: React.PointerEvent, m: Marker) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    moved.current = false;
    setDragging(m.id);
    const startX = e.clientX;
    const s = useStore.getState();
    const targets = collectSnapTargets({
      elements: s.elements, clips: s.audioClips, markers: (s.project.markers ?? []).filter((x) => x.id !== m.id),
      playhead: s.currentTime, pxPerSec, duration: s.project.duration,
    });
    const onMove = (ev: PointerEvent) => {
      if (!moved.current && Math.abs(ev.clientX - startX) < 3) return;
      moved.current = true;
      const raw = timeAt(ev.clientX);
      useStore.getState().updateMarker(m.id, { time: snapTime(raw, targets, pxPerSec).t });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      setDragging(null);
      if (!moved.current) setEditing((cur) => (cur === m.id ? null : m.id));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const { major, minor } = tickStep(pxPerSec);
  const ticks: { t: number; big: boolean }[] = [];
  if (pxPerSec > 0) {
    for (let t = 0; t <= duration + 1e-6; t += minor) {
      const big = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ticks.push({ t: Math.round(t * 1000) / 1000, big });
    }
  }
  const editingMarker = markers.find((m) => m.id === editing) ?? null;

  return (
    <div className="relative" style={{ width }}>
      <div
        ref={barRef}
        className="relative h-7 cursor-pointer select-none"
        onPointerDown={onPointerDown}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onDoubleClick={(e) => { e.preventDefault(); useStore.getState().addMarker(timeAt(e.clientX)); }}
        title="Drag to seek · double-click to add a marker (M)"
      >
        {/* ticks */}
        {ticks.map(({ t, big }) => (
          <span
            key={t}
            className="absolute bottom-0 w-px bg-[#c3cad4]"
            style={{ left: t * pxPerSec, height: big ? 10 : 5 }}
          >
            {big && (
              <span className="tabular absolute bottom-[10px] left-1 text-[9.5px] whitespace-nowrap text-t3">
                {major < 1 ? `${t.toFixed(1)}s` : formatRulerLabel(t)}
              </span>
            )}
          </span>
        ))}
        {/* played portion */}
        <div className="absolute bottom-0 left-0 h-[3px] rounded-full bg-accent/60" style={{ width: clamp(currentTime, 0, duration) * pxPerSec }} />
        {/* markers */}
        {markers.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'absolute top-0 -translate-x-1/2 ' + (dragging === m.id ? 'cursor-grabbing' : 'cursor-grab')}
            style={{ left: m.time * pxPerSec }}
            title={`${m.name} — ${m.time.toFixed(2)}s · drag to move, click to edit`}
            onPointerDown={(e) => onMarkerDown(e, m)}
          >
            <span className="block h-3 w-3 rotate-45 rounded-[2px] border border-white shadow" style={{ background: m.color }} />
            <span className="absolute top-2.5 left-1/2 h-4 w-px" style={{ background: m.color }} />
          </button>
        ))}
        {/* playhead */}
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: clamp(currentTime, 0, duration) * pxPerSec }}>
          <span className="absolute -top-0.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-accent bg-white shadow-[0_1px_4px_rgba(20,30,50,0.25)]" />
        </div>
      </div>

      {editingMarker && (
        <div
          className="absolute top-8 z-30 flex w-[230px] -translate-x-1/2 items-center gap-1.5 rounded-xl border border-line bg-panel p-2 shadow-[0_12px_32px_rgba(25,35,55,0.2)]"
          style={{ left: clamp(editingMarker.time * pxPerSec, 115, Math.max(115, width - 115)) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="df-input !h-7 min-w-0 flex-1 text-[12px]"
            value={editingMarker.name}
            onChange={(e) => useStore.getState().updateMarker(editingMarker.id, { name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null); }}
          />
          <span className="flex gap-0.5">
            {MARKER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={'h-4 w-4 rounded-full border-2 ' + (editingMarker.color === c ? 'border-t1' : 'border-transparent')}
                style={{ background: c }}
                onClick={() => useStore.getState().updateMarker(editingMarker.id, { color: c })}
                aria-label={`Colour ${c}`}
              />
            ))}
          </span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-t2 hover:bg-red-50 hover:text-red-500"
            title="Delete marker"
            onClick={() => { useStore.getState().removeMarker(editingMarker.id); setEditing(null); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
