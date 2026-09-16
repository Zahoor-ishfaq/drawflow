import { useEffect, useMemo, useRef, useState } from 'react';
import { Music } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clipLength, decodeAudioFile, waveformPeaks } from '../../lib/audioEngine';
import { clamp } from '../../lib/time';

export const AUDIO_SELECTION_ID = 'audio';

type Drag = { mode: 'move' | 'trimStart' | 'trimEnd'; startX: number; snapshot: { startTime: number; trimStart: number; trimEnd: number } };

/** Waveform drawn into a canvas the size of the clip. */
function Waveform({ width, height }: { width: number; height: number }) {
  const audio = useStore((s) => s.audio);
  const ref = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => {
    if (!audio?.buffer || width < 2) return null;
    const cols = Math.max(2, Math.floor(width / 2));
    return waveformPeaks(audio.buffer, audio.trimStart, audio.duration - audio.trimEnd, cols);
  }, [audio?.buffer, audio?.trimStart, audio?.trimEnd, audio?.duration, width]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    g.fillStyle = 'rgba(13, 157, 151, 0.75)';
    const mid = height / 2;
    const colW = width / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1.5, peaks[i] * (height - 6));
      g.fillRect(i * colW, mid - h / 2, Math.max(1, colW - 0.6), h);
    }
  }, [peaks, width, height]);

  return <canvas ref={ref} style={{ width, height }} className="pointer-events-none block" />;
}

/**
 * Time-proportional music lane under the scrub bar. Drag the clip to move it,
 * drag its ends to trim; click to select it (properties in the inspector).
 */
export function AudioLane() {
  const audio = useStore((s) => s.audio);
  const duration = useStore((s) => s.project.duration);
  const currentTime = useStore((s) => s.currentTime);
  const selected = useStore((s) => s.selectedId === AUDIO_SELECTION_ID);
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth));
    ro.observe(el);
    setLaneWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pxPerSec = duration > 0 ? laneWidth / duration : 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      useStore.getState().setAudio({
        id: crypto.randomUUID(),
        name: file.name,
        buffer,
        url: URL.createObjectURL(file),
        duration: buffer.duration,
        startTime: 0,
        trimStart: 0,
        trimEnd: 0,
        volume: 1,
      });
      useStore.getState().select(AUDIO_SELECTION_ID);
    } catch {
      alert('Could not decode this audio file.');
    }
  };

  const beginDrag = (e: React.PointerEvent, mode: Drag['mode']) => {
    if (e.button !== 0 || !audio) return;
    e.stopPropagation();
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    s.select(AUDIO_SELECTION_ID);
    drag.current = {
      mode, startX: e.clientX,
      snapshot: { startTime: audio.startTime, trimStart: audio.trimStart, trimEnd: audio.trimEnd },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !audio || pxPerSec === 0) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    const { updateAudio } = useStore.getState();
    const snap = d.snapshot;
    if (d.mode === 'move') {
      updateAudio({ startTime: Math.max(0, snap.startTime + dt) });
    } else if (d.mode === 'trimStart') {
      const maxTrim = audio.duration - snap.trimEnd - 0.5;
      const trimStart = clamp(snap.trimStart + dt, 0, maxTrim);
      // keep the remaining audio where it was on the timeline
      updateAudio({ trimStart, startTime: Math.max(0, snap.startTime + (trimStart - snap.trimStart)) });
    } else {
      const maxTrim = audio.duration - snap.trimStart - 0.5;
      updateAudio({ trimEnd: clamp(snap.trimEnd - dt, 0, maxTrim) });
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const len = audio ? clipLength(audio) : 0;
  const clipLeft = audio ? audio.startTime * pxPerSec : 0;
  const clipWidth = Math.max(len * pxPerSec, 24);

  return (
    <div
      ref={laneRef}
      className="relative h-11 w-full overflow-hidden rounded-lg border border-line bg-panel2"
      onPointerDown={() => useStore.getState().select(null)}
    >
      {!audio ? (
        <label className="flex h-full cursor-pointer items-center justify-center gap-2 text-[12px] text-t3 hover:text-accent">
          <Music size={13} />
          Add music — click to choose an audio file
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div
          className={
            'absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border-2 bg-[#e6f6f5] ' +
            (selected ? 'border-accent shadow-[0_2px_8px_rgba(13,157,151,0.3)]' : 'border-[#9fd8d4]')
          }
          style={{ left: clipLeft, width: clipWidth }}
          title={`${audio.name} — drag to move, drag the ends to trim`}
          onPointerDown={(e) => beginDrag(e, 'move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <Waveform width={Math.max(clipWidth - 4, 2)} height={32} />
          <span className="pointer-events-none absolute top-0.5 left-2 max-w-[70%] truncate text-[10px] font-medium text-[#0b6b67]">
            {audio.name}
          </span>
          {/* trim handles */}
          <div
            className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize bg-accent/70 hover:bg-accent"
            onPointerDown={(e) => beginDrag(e, 'trimStart')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="Trim start"
          />
          <div
            className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-accent/70 hover:bg-accent"
            onPointerDown={(e) => beginDrag(e, 'trimEnd')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title="Trim end"
          />
        </div>
      )}
      {/* playhead */}
      {duration > 0 && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent"
          style={{ left: clamp(currentTime / duration, 0, 1) * laneWidth }}
        />
      )}
    </div>
  );
}
