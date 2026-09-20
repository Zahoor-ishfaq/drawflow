import { useEffect, useRef } from 'react';

interface Rect { x: number; y: number; width: number; height: number }

export const RULER_SIZE = 20;

/** Pixel rulers along the top and left of the edit view, in canvas units. */
export function Rulers({ view, width, height }: { view: Rect; width: number; height: number }) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const pxPerUnit = width / view.width;
    // pick a tick spacing that keeps labels ~80px apart
    const target = 80 / pxPerUnit;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    const major = steps.find((s) => s >= target) ?? 10000;
    const minor = major / 5;

    const draw = (canvas: HTMLCanvasElement | null, horizontal: boolean) => {
      if (!canvas) return;
      const w = horizontal ? width : RULER_SIZE;
      const h = horizontal ? RULER_SIZE : height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#f5f7fa';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c7cdd6';
      ctx.fillStyle = '#7c8695';
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.lineWidth = 1;
      const start = horizontal ? view.x : view.y;
      const end = start + (horizontal ? view.width : view.height);
      const first = Math.floor(start / minor) * minor;
      ctx.beginPath();
      for (let v = first; v <= end; v += minor) {
        const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
        const pos = Math.round((v - start) * pxPerUnit) + 0.5;
        const len = isMajor ? 9 : v % (major / 2) === 0 ? 6 : 3;
        if (horizontal) { ctx.moveTo(pos, RULER_SIZE); ctx.lineTo(pos, RULER_SIZE - len); }
        else { ctx.moveTo(RULER_SIZE, pos); ctx.lineTo(RULER_SIZE - len, pos); }
        if (isMajor) {
          const label = String(Math.round(v));
          if (horizontal) ctx.fillText(label, pos + 3, 9);
          else {
            ctx.save();
            ctx.translate(9, pos - 3);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
      // frame edge
      ctx.strokeStyle = '#dfe4ea';
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(0, RULER_SIZE - 0.5); ctx.lineTo(w, RULER_SIZE - 0.5); }
      else { ctx.moveTo(RULER_SIZE - 0.5, 0); ctx.lineTo(RULER_SIZE - 0.5, h); }
      ctx.stroke();
    };
    draw(topRef.current, true);
    draw(leftRef.current, false);
  }, [view, width, height]);

  return (
    <>
      <canvas ref={topRef} className="pointer-events-none absolute top-0 left-0" style={{ width, height: RULER_SIZE }} />
      <canvas ref={leftRef} className="pointer-events-none absolute top-0 left-0" style={{ width: RULER_SIZE, height }} />
      <div className="pointer-events-none absolute top-0 left-0 bg-panel2" style={{ width: RULER_SIZE, height: RULER_SIZE }} />
    </>
  );
}
