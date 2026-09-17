import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Music, Square } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAudioSource, decodeToSource } from '../../store/audioSources';
import { waveformPeaks } from '../../lib/audioEngine';
import { startRecording, stopRecording, useRecorder } from '../../lib/recorder';
import { clamp } from '../../lib/time';
import type { AudioClip, AudioLaneKind } from '../../types';

export const clipSelectionId = (id: string) => `clip:${id}`;
export const selectedClipId = (selectedId: string | null) =>
  selectedId?.startsWith('clip:') ? selectedId.slice(5) : null;

type Drag = { mode: 'move' | 'trimStart' | 'trimEnd'; startX: number; snap: AudioClip };

/** Waveform drawn into a canvas the size of the clip. */
function Waveform({ clip, width, height, color }: { clip: AudioClip; width: number; height: number; color: string }) {
  const source = useAudioSource(clip.sourceId);
  const ref = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => {
    if (!source || width < 2) return null;
    const cols = Math.max(2, Math.floor(width / 2));
    return waveformPeaks(source, clip.offset, clip.offset + clip.duration, cols);
  }, [source, clip.offset, clip.duration, width]);

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
    g.fillStyle = color;
    const mid = height / 2;
    const colW = width / peaks.length;
    const fiCols = clip.fadeIn > 0 ? (clip.fadeIn / clip.duration) * peaks.length : 0;
    const foCols = clip.fadeOut > 0 ? (clip.fadeOut / clip.duration) * peaks.length : 0;
    for (let i = 0; i < peaks.length; i++) {
      let env = clip.muted ? 0.25 : 1;
      if (fiCols > 0 && i < fiCols) env *= i / fiCols;
      if (foCols > 0 && i > peaks.length - foCols) env *= (peaks.length - i) / foCols;
      const h = Math.max(1.5, peaks[i] * clip.volume * env * (height - 6));
      g.fillRect(i * colW, mid - h / 2, Math.max(1, colW - 0.6), h);
    }
  }, [peaks, width, height, color, clip.fadeIn, clip.fadeOut, clip.duration, clip.volume, clip.muted]);

  return <canvas ref={ref} style={{ width, height }} className="pointer-events-none block" />;
}

function ClipBlock({ clip, pxPerSec }: { clip: AudioClip; pxPerSec: number }) {
  const selected = useStore((s) => s.selectedId === clipSelectionId(clip.id));
  const source = useAudioSource(clip.sourceId);
  const drag = useRef<Drag | null>(null);
  const voice = clip.lane === 'voice';

  const begin = (e: React.PointerEvent, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    s.select(clipSelectionId(clip.id));
    drag.current = { mode, startX: e.clientX, snap: { ...clip } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || pxPerSec === 0 || !source) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    const { updateAudioClip } = useStore.getState();
    const s = d.snap;
    if (d.mode === 'move') {
      updateAudioClip(clip.id, { startTime: Math.max(0, s.startTime + dt) });
    } else if (d.mode === 'trimStart') {
      const delta = clamp(dt, -s.offset, s.duration - 0.2);
      updateAudioClip(clip.id, { startTime: s.startTime + delta, offset: s.offset + delta, duration: s.duration - delta });
    } else {
      const maxDur = source.duration - s.offset;
      updateAudioClip(clip.id, { duration: clamp(s.duration + dt, 0.2, maxDur) });
    }
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const width = Math.max(clip.duration * pxPerSec, 24);
  const tone = voice
    ? { bg: '#fdeef0', border: selected ? '#e05a6d' : '#f0a5b0', wave: 'rgba(224, 90, 109, 0.75)', text: '#9a3040' }
    : { bg: '#e6f6f5', border: selected ? '#0d9d97' : '#9fd8d4', wave: 'rgba(13, 157, 151, 0.75)', text: '#0b6b67' };

  return (
    <div
      className={'absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border-2 ' + (selected ? 'shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : '')}
      style={{ left: clip.startTime * pxPerSec, width, background: tone.bg, borderColor: tone.border, opacity: clip.muted ? 0.6 : 1 }}
      title={`${clip.name} — drag to move, drag the ends to trim, click to edit`}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Waveform clip={clip} width={Math.max(width - 4, 2)} height={30} color={tone.wave} />
      <span className="pointer-events-none absolute top-0.5 left-2 max-w-[75%] truncate text-[10px] font-medium" style={{ color: tone.text }}>
        {clip.muted ? '🔇 ' : ''}{clip.name}
      </span>
      <div className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize opacity-70 hover:opacity-100" style={{ background: tone.border }}
        onPointerDown={(e) => begin(e, 'trimStart')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Trim start" />
      <div className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize opacity-70 hover:opacity-100" style={{ background: tone.border }}
        onPointerDown={(e) => begin(e, 'trimEnd')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Trim end" />
    </div>
  );
}

/** Import an audio file onto a lane at time t. */
export async function importAudioFile(file: File, lane: AudioLaneKind, at = 0): Promise<void> {
  const source = await decodeToSource(file, file.name);
  useStore.getState().addAudioClip({
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ''),
    lane,
    sourceId: source.id,
    startTime: at,
    offset: 0,
    duration: source.duration,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
  });
}

/** One time-proportional lane (music or voiceover). */
function Lane({ lane, laneWidth, pxPerSec }: { lane: AudioLaneKind; laneWidth: number; pxPerSec: number }) {
  const clips = useStore((s) => s.audioClips);
  const duration = useStore((s) => s.project.duration);
  const currentTime = useStore((s) => s.currentTime);
  const rec = useRecorder();
  const mine = clips.filter((c) => c.lane === lane);
  const voice = lane === 'voice';

  return (
    <div
      className="relative h-10 w-full overflow-hidden rounded-lg border border-line bg-panel2"
      onPointerDown={() => useStore.getState().select(null)}
    >
      {mine.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[11.5px] text-t3">
          {voice ? <Mic size={12} /> : <Music size={12} />}
          {voice ? 'Voiceover — press Record and narrate while the scribe plays' : 'Music — drop a file here or use the Music tool'}
        </div>
      )}
      {mine.map((c) => <ClipBlock key={c.id} clip={c} pxPerSec={pxPerSec} />)}
      {voice && rec.active && (
        <div
          className="pointer-events-none absolute top-1 bottom-1 rounded-md border-2 border-dashed border-[#e05a6d] bg-[#fdeef0]/70"
          style={{ left: rec.startedAt * pxPerSec, width: Math.max(2, (currentTime - rec.startedAt) * pxPerSec) }}
        />
      )}
      {duration > 0 && (
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: clamp(currentTime / duration, 0, 1) * laneWidth }} />
      )}
    </div>
  );
}

/** Both lanes plus the record control, aligned under the scrub bar. */
export function AudioLanes() {
  const duration = useStore((s) => s.project.duration);
  const rec = useRecorder();
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth));
    ro.observe(el);
    setLaneWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const pxPerSec = duration > 0 ? laneWidth / duration : 0;

  return (
    <div className="flex items-stretch gap-3">
      <div
        ref={laneRef}
        className={'flex min-w-0 flex-1 flex-col gap-1 rounded-lg ' + (dragOver ? 'outline outline-2 outline-accent' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('audio/')) {
            const rect = laneRef.current?.getBoundingClientRect();
            const at = rect && pxPerSec > 0 ? Math.max(0, (e.clientX - rect.left) / pxPerSec) : 0;
            void importAudioFile(f, 'music', at).catch(() => alert('Could not decode this audio file.'));
          }
        }}
      >
        <Lane lane="music" laneWidth={laneWidth} pxPerSec={pxPerSec} />
        <Lane lane="voice" laneWidth={laneWidth} pxPerSec={pxPerSec} />
      </div>
      <div className="flex w-[132px] shrink-0 flex-col items-end justify-between py-0.5">
        <span className="text-[10.5px] text-t3">music</span>
        <button
          type="button"
          className={
            'df-ui-anim flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium text-white transition-all ' +
            (rec.active ? 'bg-[#d9414f] hover:brightness-105' : 'bg-[#e05a6d] hover:brightness-105')
          }
          title={rec.active ? 'Stop recording' : 'Record a voiceover while the scribe plays from the playhead'}
          onClick={() => (rec.active ? stopRecording() : void startRecording())}
        >
          {rec.active ? <Square size={11} /> : <Mic size={12} />}
          {rec.active ? 'Stop' : 'Record'}
        </button>
      </div>
    </div>
  );
}
