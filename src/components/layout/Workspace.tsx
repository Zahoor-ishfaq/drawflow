import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clamp } from '../../lib/time';
import { Stage } from '../canvas/Stage';

// Zoom/pan is view state, separate from element transforms (spec §7).
// The artboard auto-fits the available space and re-fits on container resize
// until the user zooms or pans manually.
export function Workspace() {
  const project = useStore((s) => s.project);
  const elementCount = useStore((s) => s.elements.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 0.35, x: 0, y: 0 });
  const userAdjusted = useRef(false);
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth < 50 || el.clientHeight < 50) return;
    const z = Math.min(
      (el.clientWidth - 64) / project.width,
      (el.clientHeight - 64) / project.height,
    );
    userAdjusted.current = false;
    setView({ zoom: clamp(z, 0.02, 4), x: 0, y: 0 });
  }, [project.width, project.height]);

  // fit on mount, when the artboard size changes, and on container resize
  // (unless the user has taken over the view)
  useEffect(() => {
    fit();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!userAdjusted.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomBy = useCallback((factor: number, px = 0, py = 0) => {
    userAdjusted.current = true;
    setView((v) => {
      const zoom = clamp(v.zoom * factor, 0.02, 6);
      // keep the point (px, py — relative to container center) stationary
      return {
        zoom,
        x: px - ((px - v.x) * zoom) / v.zoom,
        y: py - ((py - v.y) * zoom) / v.zoom,
      };
    });
  }, []);

  // native wheel listener so preventDefault works (React wheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(
        Math.exp(-e.deltaY * 0.0012),
        e.clientX - (rect.left + rect.width / 2),
        e.clientY - (rect.top + rect.height / 2),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 1) return; // middle-drag pans
    e.preventDefault();
    userAdjusted.current = true;
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
      className="dotted-ground relative min-w-0 flex-1 overflow-hidden"
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
        <div className="pointer-events-none absolute inset-x-0 top-[46%] text-center">
          <div className="text-[15px] font-medium text-t2">Your canvas is empty</div>
          <div className="mt-1 text-[13px] text-t3">
            Use the toolbar on the left — add text, a shape, or drop in an SVG
          </div>
        </div>
      )}

      <div className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-full border border-line bg-panel px-1.5 py-1 shadow-[0_4px_16px_rgba(25,35,55,0.12)]">
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1"
          onClick={() => zoomBy(1 / 1.25)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          className="tabular min-w-11 px-1 text-center text-[12px] text-t2 hover:text-t1"
          onClick={() => {
            userAdjusted.current = true;
            setView({ zoom: 1, x: 0, y: 0 });
          }}
          title="Zoom to 100%"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1"
          onClick={() => zoomBy(1.25)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={13} />
        </button>
        <span className="mx-0.5 h-3.5 w-px bg-line" />
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1"
          onClick={fit}
          title="Fit artboard"
          aria-label="Fit artboard"
        >
          <Maximize size={12} />
        </button>
      </div>
    </div>
  );
}
