import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { unionBounds } from '../../lib/camera';
import { clamp } from '../../lib/time';
import { Stage } from '../canvas/Stage';

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
  const setViewport = useStore((s) => s.setViewport);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ cx: project.width / 2, cy: project.height / 2, zoom: 0.4 });
  const userAdjusted = useRef(false);
  const midDrag = useRef<{ x: number; y: number } | null>(null);

  // container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const frameView = useCallback(
    (b: { x: number; y: number; width: number; height: number }, pad = 64) => {
      if (size.w < 50 || size.h < 50) return;
      const zoom = clamp(Math.min((size.w - pad * 2) / b.width, (size.h - pad * 2) / b.height), MIN_ZOOM, MAX_ZOOM);
      setView({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, zoom });
    },
    [size],
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

  // initial fit (and re-fit on resize / artboard change until the user takes over)
  useEffect(() => {
    if (!userAdjusted.current) frameView({ x: 0, y: 0, width: project.width, height: project.height });
  }, [size, project.width, project.height, frameView]);

  // visible canvas rect → store (so new elements land where the user is looking)
  const editVb = {
    x: view.cx - size.w / view.zoom / 2,
    y: view.cy - size.h / view.zoom / 2,
    width: size.w / view.zoom,
    height: size.h / view.zoom,
  };
  useEffect(() => {
    if (size.w > 0) setViewport(editVb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, setViewport]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
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
    userAdjusted.current = true;
    setView((v) => ({ ...v, cx: v.cx - dxCanvas, cy: v.cy - dyCanvas }));
  }, []);

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
            <Stage mode="edit" cssWidth={size.w} cssHeight={size.h} editView={editVb} onPan={panBy} />
          </div>
        )
      )}

      {elements.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[46%] text-center">
          <div className="text-[15px] font-medium text-t2">Your canvas is empty</div>
          <div className="mt-1 text-[13px] text-t3">
            Use the toolbar on the left — add text, a shape, or an image from the library.
            Drag the paper to move around.
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
