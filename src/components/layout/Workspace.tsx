import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { sequenceOrder, useStore } from '../../store/useStore';
import { useUiStore } from '../../store/uiStore';
import { cameraForElement, unionBounds, viewBoxFor } from '../../lib/camera';
import { clamp } from '../../lib/time';
import { onShortcut } from '../../hooks/useKeyboardShortcuts';
import { Stage } from '../canvas/Stage';
import { Rulers } from '../canvas/Rulers';

// Edit view is an infinite sheet of paper (VideoScribe-style): drag empty
// paper to pan, wheel to zoom, place elements anywhere. Camera view shows the
// video frame letterboxed in the workspace. View state is separate from
// element transforms.

interface View { cx: number; cy: number; zoom: number } // zoom = screen px per canvas unit

const MIN_ZOOM = 0.03;
const MAX_ZOOM = 8;

export function Workspace() {
  const project = useStore((s) => s.project);
  const elements = useStore((s) => s.elements);
  const cameraView = useStore((s) => s.cameraView);
  const isPlaying = useStore((s) => s.isPlaying);
  const setCameraView = useStore((s) => s.setCameraView);
  const setCameraBoundary = useStore((s) => s.setCameraBoundary);
  const focusRequest = useStore((s) => s.focusRequest);
  const showRulers = useUiStore((s) => s.showRulers);
  const snapToGrid = useUiStore((s) => s.snapToGrid);
  const gridSize = useUiStore((s) => s.gridSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ cx: project.width / 2, cy: project.height / 2, zoom: 0.4 });
  const userAdjusted = useRef(false);
  const midDrag = useRef<{ x: number; y: number } | null>(null);
  const tween = useRef<number>(0);

  /** Glide the view to a target over ~320ms. */
  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(tween.current);
    setView((from) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 320);
        const e = 1 - Math.pow(1 - p, 3);
        setView({
          cx: from.cx + (target.cx - from.cx) * e,
          cy: from.cy + (target.cy - from.cy) * e,
          zoom: Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e),
        });
        if (p < 1) tween.current = requestAnimationFrame(step);
      };
      tween.current = requestAnimationFrame(step);
      return from;
    });
  }, []);

  // container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // camera boundary on screen (px, relative to the container): the largest
  // video-aspect rectangle that fits with a margin, centred
  const boundaryPx = (() => {
    const mx = Math.max(24, size.w * 0.09);
    const my = Math.max(24, size.h * 0.12);
    const scale = Math.max(0.01, Math.min((size.w - 2 * mx) / project.width, (size.h - 2 * my) / project.height));
    const w = project.width * scale;
    const h = project.height * scale;
    return { left: (size.w - w) / 2, top: (size.h - h) / 2, width: w, height: h };
  })();

  /** Zoom/centre the view so canvas rect `b` fills the on-screen boundary. */
  const frameView = useCallback(
    (b: { x: number; y: number; width: number; height: number }) => {
      if (size.w < 50 || size.h < 50) return;
      const zoom = clamp(Math.min(boundaryPx.width / b.width, boundaryPx.height / b.height), MIN_ZOOM, MAX_ZOOM);
      setView({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, zoom });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size, project.width, project.height],
  );

  /** Fit everything the user has placed (or the video frame when empty). */
  const fit = useCallback(() => {
    userAdjusted.current = false;
    const u = unionBounds(elements);
    const frame = { x: 0, y: 0, width: project.width, height: project.height };
    if (!u) return frameView(frame);
    // include the video frame while the content is near it, so the first
    // elements don't jump around as you add them
    const near =
      u.x < project.width * 1.5 && u.y < project.height * 1.5 &&
      u.x + u.width > -project.width * 0.5 && u.y + u.height > -project.height * 0.5;
    if (near) {
      const x0 = Math.min(u.x, 0), y0 = Math.min(u.y, 0);
      const x1 = Math.max(u.x + u.width, project.width), y1 = Math.max(u.y + u.height, project.height);
      return frameView({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
    frameView(u);
  }, [elements, project.width, project.height, frameView]);

  // bring a strip-selected element's camera frame into view (edit view only)
  useEffect(() => {
    if (!focusRequest || cameraView || size.w < 50) return;
    const st = useStore.getState();
    const ordered = sequenceOrder(st.elements);
    const idx = ordered.findIndex((e) => e.id === focusRequest.id);
    if (idx === -1) return;
    const r = viewBoxFor(cameraForElement(idx, ordered, st.project), st.project);
    // put that shot exactly inside the on-screen boundary
    const zoom = clamp(Math.min(boundaryPx.width / r.width, boundaryPx.height / r.height), MIN_ZOOM, MAX_ZOOM);
    userAdjusted.current = true;
    animateTo({ cx: r.x + r.width / 2, cy: r.y + r.height / 2, zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // initial fit (and re-fit on resize / artboard change until the user takes over)
  useEffect(() => {
    if (!userAdjusted.current) frameView({ x: 0, y: 0, width: project.width, height: project.height });
  }, [size, project.width, project.height, frameView]);

  // visible canvas rect, and the boundary's canvas rect → store (new elements
  // land inside the boundary and take it as their shot)
  const editVb = {
    x: view.cx - size.w / view.zoom / 2,
    y: view.cy - size.h / view.zoom / 2,
    width: size.w / view.zoom,
    height: size.h / view.zoom,
  };
  const boundaryCanvas = {
    x: editVb.x + boundaryPx.left / view.zoom,
    y: editVb.y + boundaryPx.top / view.zoom,
    width: boundaryPx.width / view.zoom,
    height: boundaryPx.height / view.zoom,
  };
  useEffect(() => {
    if (size.w > 0) setCameraBoundary(boundaryCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, setCameraBoundary]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    cancelAnimationFrame(tween.current);
    userAdjusted.current = true;
    setView((v) => {
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      // keep the canvas point under (sx, sy) stationary; sx/sy relative to container centre
      const px = v.cx + sx / v.zoom;
      const py = v.cy + sy / v.zoom;
      return { zoom, cx: px - sx / zoom, cy: py - sy / zoom };
    });
  }, []);

  const panBy = useCallback((dxCanvas: number, dyCanvas: number) => {
    cancelAnimationFrame(tween.current);
    userAdjusted.current = true;
    setView((v) => ({ ...v, cx: v.cx - dxCanvas, cy: v.cy - dyCanvas }));
  }, []);

  // keyboard zoom shortcuts (Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1 / F)
  useEffect(() => onShortcut((name) => {
    if (cameraView) return;
    if (name === 'zoom-in') zoomAt(1.25, 0, 0);
    else if (name === 'zoom-out') zoomAt(1 / 1.25, 0, 0);
    else if (name === 'zoom-fit') fit();
    else if (name === 'zoom-100') { userAdjusted.current = true; setView((v) => ({ ...v, zoom: 1 })); }
    else if (name === 'zoom-selection') {
      const st = useStore.getState();
      const sel = st.elements.filter((e) => st.selectedIds.includes(e.id));
      const u = unionBounds(sel);
      if (!u) return fit();
      const pad = Math.max(u.width, u.height) * 0.25 + 40;
      userAdjusted.current = true;
      const b = { x: u.x - pad, y: u.y - pad, width: u.width + pad * 2, height: u.height + pad * 2 };
      const zoom = clamp(Math.min(boundaryPx.width / b.width, boundaryPx.height / b.height), MIN_ZOOM, MAX_ZOOM);
      animateTo({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, zoom });
    }
  }), [cameraView, zoomAt, fit, animateTo, boundaryPx.width, boundaryPx.height]);

  // native wheel listener so preventDefault works (React wheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (cameraView) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        Math.exp(-e.deltaY * 0.0012),
        e.clientX - (rect.left + rect.width / 2),
        e.clientY - (rect.top + rect.height / 2),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, cameraView]);

  // middle-drag pans from anywhere (edit view)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 1 || cameraView) return;
    e.preventDefault();
    midDrag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = midDrag.current;
    if (!d) return;
    panBy((e.clientX - d.x) / view.zoom, (e.clientY - d.y) / view.zoom);
    midDrag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => { midDrag.current = null; };

  // camera view: the video frame letterboxed in the workspace
  const frameScale = Math.max(0.01, Math.min((size.w - 48) / project.width, (size.h - 72) / project.height));
  const frameW = project.width * frameScale;
  const frameH = project.height * frameScale;

  return (
    <div
      ref={containerRef}
      className="dotted-ground relative min-w-0 flex-1 overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {cameraView ? (
        <div
          className="absolute"
          style={{ left: (size.w - frameW) / 2, top: (size.h - frameH) / 2 + 12, width: frameW, height: frameH }}
        >
          <Stage mode="camera" cssWidth={frameW} cssHeight={frameH} onPan={panBy} />
        </div>
      ) : (
        size.w > 0 && (
          <div className="absolute inset-0">
            <Stage mode="edit" cssWidth={size.w} cssHeight={size.h} editView={editVb} boundary={boundaryCanvas} onPan={panBy} />
            {snapToGrid && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: 'linear-gradient(to right, rgba(13,157,151,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(13,157,151,0.12) 1px, transparent 1px)',
                  backgroundSize: `${gridSize * view.zoom}px ${gridSize * view.zoom}px`,
                  backgroundPosition: `${(-editVb.x * view.zoom) % (gridSize * view.zoom)}px ${(-editVb.y * view.zoom) % (gridSize * view.zoom)}px`,
                  opacity: gridSize * view.zoom < 8 ? 0 : 1,
                }}
              />
            )}
            {showRulers && <Rulers view={editVb} width={size.w} height={size.h} />}
          </div>
        )
      )}

      {elements.length === 0 && !cameraView && (
        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={{ left: boundaryPx.left, top: boundaryPx.top, width: boundaryPx.width, height: boundaryPx.height }}
        >
          <div className="max-w-[420px] px-6 text-center">
            <div className="text-[15px] font-medium text-t2">Your canvas is empty</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-t3">
              Everything inside this dashed boundary is what the video captures. Add text,
              shapes or images from the toolbar; drag the paper to move to a new shot.
            </div>
          </div>
        </div>
      )}

      {/* edit / camera view toggle */}
      <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center rounded-full border border-line bg-panel p-0.5 shadow-[0_4px_16px_rgba(25,35,55,0.12)]">
        {(['edit', 'camera'] as const).map((mode) => {
          const active = mode === 'camera' ? cameraView : !cameraView;
          return (
            <button
              key={mode}
              type="button"
              disabled={isPlaying}
              className={
                'df-ui-anim h-7 rounded-full px-3.5 text-[12px] font-medium transition-all disabled:opacity-60 ' +
                (active ? 'bg-accent text-white' : 'text-t2 hover:text-t1')
              }
              onClick={() => setCameraView(mode === 'camera')}
              title={mode === 'camera' ? 'See what the camera sees at the current time' : 'Edit the infinite canvas'}
            >
              {mode === 'camera' ? 'Camera view' : 'Edit view'}
            </button>
          );
        })}
      </div>

      {!cameraView && (
        <div className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-full border border-line bg-panel px-1.5 py-1 shadow-[0_4px_16px_rgba(25,35,55,0.12)]">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1"
            onClick={() => zoomAt(1 / 1.25, 0, 0)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="tabular min-w-11 px-1 text-center text-[12px] text-t2 hover:text-t1"
            onClick={() => { userAdjusted.current = true; setView((v) => ({ ...v, zoom: 1 })); }}
            title="Zoom to 100%"
          >
            {Math.round(view.zoom * 100)}%
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1"
            onClick={() => zoomAt(1.25, 0, 0)}
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
            title="Fit everything"
            aria-label="Fit everything"
          >
            <Maximize size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
