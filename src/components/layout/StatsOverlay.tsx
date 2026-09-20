import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';

/** Frame rate, frame time and document size — bottom-left of the workspace. */
export function StatsOverlay() {
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const elements = useStore((s) => s.elements.length);
  const clips = useStore((s) => s.audioClips.length);
  const paths = useStore((s) => s.elements.reduce((n, e) => n + e.paths.length, 0));
  const isPlaying = useStore((s) => s.isPlaying);
  const last = useRef(performance.now());
  const frames = useRef(0);
  const worst = useRef(0);

  useEffect(() => {
    let id = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      frames.current++;
      worst.current = Math.max(worst.current, now - prev);
      prev = now;
      if (now - last.current >= 500) {
        setFps(Math.round((frames.current * 1000) / (now - last.current)));
        setFrameMs(Math.round(worst.current));
        frames.current = 0;
        worst.current = 0;
        last.current = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  return (
    <div className="tabular pointer-events-none absolute bottom-4 left-4 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] text-t2 shadow">
      <div><span className="text-t1">{fps} fps</span> · longest frame {frameMs} ms{isPlaying ? '' : ' (idle)'}</div>
      <div>{elements} elements · {paths.toLocaleString()} paths · {clips} clips</div>
      {mem && <div>{(mem.usedJSHeapSize / 1048576).toFixed(0)} MB JS heap</div>}
    </div>
  );
}
