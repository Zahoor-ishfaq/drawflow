import { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { clamp } from '../../lib/time';

/** Video-player-style seek bar with markers at each element's start. */
export function ScrubBar() {
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.project.duration);
  const elements = useStore((s) => s.elements);
  const barRef = useRef<HTMLDivElement>(null);

  const frac = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;

  const seekTo = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const f = clamp((clientX - rect.left) / rect.width, 0, 1);
    useStore.getState().setTime(f * duration);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    useStore.getState().pause();
    seekTo(e.clientX);
    const onMove = (ev: PointerEvent) => seekTo(ev.clientX);
    const onUp = () => window.removeEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return (
    <div
      className="group flex h-7 min-w-0 flex-1 cursor-pointer items-center"
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
    >
      <div ref={barRef} className="relative h-1.5 w-full rounded-full bg-[#d6dce4]">
        {/* element start markers */}
        {duration > 0 &&
          elements.map((el) => (
            <span
              key={el.id}
              className="absolute top-1/2 h-1.5 w-[3px] -translate-y-1/2 rounded-full bg-[#aab3c0]"
              style={{ left: `${clamp(el.startTime / duration, 0, 1) * 100}%` }}
            />
          ))}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${frac * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white shadow-[0_1px_4px_rgba(20,30,50,0.25)] transition-transform group-hover:scale-110"
          style={{ left: `${frac * 100}%` }}
        />
      </div>
    </div>
  );
}
