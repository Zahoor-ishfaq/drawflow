import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { clamp } from '../../lib/time';
import { Stage } from '../canvas/Stage';

// Zoom/pan is view state, separate from element transforms (spec §7).
export function Workspace() {
  const project = useStore((s) => s.project);
  const elementCount = useStore((s) => s.elements.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 0.4, x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const z = Math.min(
      (el.clientWidth - 96) / project.width,
      (el.clientHeight - 96) / project.height,
    );
    setView({ zoom: clamp(z, 0.05, 4), x: 0, y: 0 });
  }, [project.width, project.height]);

  useEffect(() => { fit(); }, [fit]);

  // native wheel listener so preventDefault works (React wheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      setView((v) => {
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0012), 0.05, 6);
        // keep the point under the cursor stationary while zooming
        return {
          zoom,
          x: px - ((px - v.x) * zoom) / v.zoom,
          y: py - ((py - v.y) * zoom) / v.zoom,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 1) return; // middle-drag pans
    e.preventDefault();
    panDrag.current = { startX: e.clientX, startY: e.clientY, panX: view.x, panY: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = panDrag.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      x: d.panX + (e.clientX - d.startX),
      y: d.panY + (e.clientY - d.startY),
    }));
  };
  const onPointerUp = () => { panDrag.current = null; };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-app"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute top-1/2 left-1/2"
        style={{ transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))` }}
      >
        <Stage zoom={view.zoom} />
      </div>

      {elementCount === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[44%] text-center text-[13px] text-t3">
          Add text, a shape, or drop an SVG to begin
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-sm border border-line bg-panel px-1.5 py-1">
        <button
          type="button"
          className="tabular px-1 text-[12px] text-t2 hover:text-t1"
          onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          title="Zoom to 100%"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <span className="h-3.5 w-px bg-line" />
        <button
          type="button"
          className="px-1 text-[12px] text-t2 hover:text-t1"
          onClick={fit}
          title="Fit artboard"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
