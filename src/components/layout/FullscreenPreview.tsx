import { useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/uiStore';
import { formatTimecode } from '../../lib/time';
import { Stage } from '../canvas/Stage';

/** Whole-window playback of the camera view (Shift+F). */
export function FullscreenPreview() {
  const project = useStore((s) => s.project);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const setUi = useUiStore((s) => s.set);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    // try the real full-screen API too; the overlay works without it
    void el.requestFullscreen?.().catch(() => undefined);
    const s = useStore.getState();
    s.setCameraView(true);
    if (!s.isPlaying) s.play();
    return () => {
      ro.disconnect();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // leaving browser full screen (Esc) closes the preview
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setUi({ fullscreenPreview: false }); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [setUi]);

  const poke = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2200);
  };

  const scale = Math.max(0.01, Math.min(size.w / project.width, (size.h - 0) / project.height));
  const w = project.width * scale, h = project.height * scale;
  const s = useStore.getState();

  return (
    <div ref={ref} className="fixed inset-0 z-[70] flex items-center justify-center bg-black" onMouseMove={poke} onClick={() => (isPlaying ? s.pause() : s.play())}>
      {size.w > 0 && (
        <div style={{ width: w, height: h }} onClick={(e) => e.stopPropagation()}>
          <Stage mode="camera" cssWidth={w} cssHeight={h} onPan={() => undefined} />
        </div>
      )}
      <div
        className={'absolute right-0 bottom-0 left-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 py-4 text-white transition-opacity ' + (chrome ? 'opacity-100' : 'opacity-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" onClick={() => (isPlaying ? s.pause() : s.play())} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <input
          type="range"
          className="df-slider flex-1"
          min={0}
          max={project.duration}
          step={1 / project.fps}
          value={currentTime}
          onChange={(e) => { s.pause(); s.setTime(parseFloat(e.target.value)); }}
        />
        <span className="tabular text-[12.5px]">{formatTimecode(currentTime, project.fps)} / {formatTimecode(project.duration, project.fps)}</span>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" onClick={() => setUi({ fullscreenPreview: false })} aria-label="Exit full screen">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
