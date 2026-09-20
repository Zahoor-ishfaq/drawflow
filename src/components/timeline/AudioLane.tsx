import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Music, Volume2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAudioSource, decodeToSource } from '../../store/audioSources';
import { waveformPeaks } from '../../lib/audioEngine';
import { useRecorder } from '../../lib/recorder';
import { clamp } from '../../lib/time';
import { collectSnapTargets, snapTime } from '../../lib/snapping';
import type { AudioClip, AudioLaneKind } from '../../types';

export const clipSelectionId = (id: string) => `clip:${id}`;
export const selectedClipId = (selectedId: string | null) =>
  selectedId?.startsWith('clip:') ? selectedId.slice(5) : null;

type Drag = { mode: 'move' | 'trimStart' | 'trimEnd'; startX: number; snap: AudioClip; targets: number[] };

export const LANES: { kind: AudioLaneKind; label: string; hint: string; Icon: typeof Mic }[] = [
  { kind: 'music', label: 'music', hint: 'Music — drop a file here or use the Music tool', Icon: Music },
  { kind: 'voice', label: 'voice', hint: 'Voiceover — press Record, or add a voice from the Voice tool', Icon: Mic },
  { kind: 'sfx', label: 'sfx', hint: 'Sound effects — drop short clips here', Icon: Volume2 },
];

const TONES: Record<AudioLaneKind, { bg: string; border: string; sel: string; wave: string; text: string }> = {
  voice: { bg: '#fdeef0', border: '#f0a5b0', sel: '#e05a6d', wave: 'rgba(224, 90, 109, 0.75)', text: '#9a3040' },
  music: { bg: '#e6f6f5', border: '#9fd8d4', sel: '#0d9d97', wave: 'rgba(13, 157, 151, 0.75)', text: '#0b6b67' },
  sfx: { bg: '#fff4e0', border: '#f2c98a', sel: '#e0722f', wave: 'rgba(224, 114, 47, 0.75)', text: '#8a4a18' },
};

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

function ClipBlock({ clip, pxPerSec, onSnap }: { clip: AudioClip; pxPerSec: number; onSnap: (t: number | null) => void }) {
  const selected = useStore((s) => s.selectedId === clipSelectionId(clip.id));
  const anySolo = useStore((s) => s.audioClips.some((c) => c.solo));
  const source = useAudioSource(clip.sourceId);
  const drag = useRef<Drag | null>(null);
  const tone = TONES[clip.lane] ?? TONES.music;
  const silenced = clip.muted || (anySolo && !clip.solo);

  const begin = (e: React.PointerEvent, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    s.select(clipSelectionId(clip.id));
    const targets = collectSnapTargets({
      elements: s.elements, clips: s.audioClips, markers: s.project.markers ?? [],
      playhead: s.currentTime, excludeClipIds: [clip.id], pxPerSec, duration: s.project.duration,
    });
    drag.current = { mode, startX: e.clientX, snap: { ...clip }, targets };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || pxPerSec === 0 || !source) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    const { updateAudioClip } = useStore.getState();
    const s = d.snap;
    if (d.mode === 'move') {
      // snap either edge of the clip
      const rawStart = Math.max(0, s.startTime + dt);
      const a = snapTime(rawStart, d.targets, pxPerSec);
      const b = snapTime(rawStart + s.duration, d.targets, pxPerSec);
      const start = a.snapped !== null ? a.t : b.snapped !== null ? b.t - s.duration : rawStart;
      onSnap(a.snapped ?? b.snapped);
      updateAudioClip(clip.id, { startTime: Math.max(0, start) });
    } else if (d.mode === 'trimStart') {
      const { t, snapped } = snapTime(s.startTime + dt, d.targets, pxPerSec);
      onSnap(snapped);
      const delta = clamp(t - s.startTime, -s.offset, s.duration - 0.2);
      updateAudioClip(clip.id, { startTime: s.startTime + delta, offset: s.offset + delta, duration: s.duration - delta });
    } else {
      const maxDur = source.duration - s.offset;
      const { t, snapped } = snapTime(s.startTime + s.duration + dt, d.targets, pxPerSec);
      onSnap(snapped);
      updateAudioClip(clip.id, { duration: clamp(t - s.startTime, 0.2, maxDur) });
    }
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    onSnap(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const width = Math.max(clip.duration * pxPerSec, 24);

  return (
    <div
      className={'absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border-2 ' + (selected ? 'shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : '')}
      style={{ left: clip.startTime * pxPerSec, width, background: tone.bg, borderColor: selected ? tone.sel : tone.border, opacity: silenced ? 0.55 : 1 }}
      title={`${clip.name} — drag to move, drag the ends to trim, click to edit`}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Waveform clip={clip} width={Math.max(width - 4, 2)} height={30} color={tone.wave} />
      <span className="pointer-events-none absolute top-0.5 left-2 max-w-[75%] truncate text-[10px] font-medium" style={{ color: tone.text }}>
        {clip.muted ? '🔇 ' : clip.solo ? '🎧 ' : ''}{clip.name}
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

/** One time-proportional lane. */
function Lane({ lane, width, pxPerSec }: { lane: AudioLaneKind; width: number; pxPerSec: number }) {
  const clips = useStore((s) => s.audioClips);
  const currentTime = useStore((s) => s.currentTime);
  const rec = useRecorder();
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const mine = clips.filter((c) => c.lane === lane);
  const def = LANES.find((l) => l.kind === lane)!;
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={'relative h-10 overflow-hidden rounded-lg border bg-panel2 ' + (dragOver ? 'border-accent' : 'border-line')}
      style={{ width }}
      onPointerDown={() => useStore.getState().select(null)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('audio/')) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const at = pxPerSec > 0 ? Math.max(0, (e.clientX - rect.left) / pxPerSec) : 0;
          void importAudioFile(f, lane, at).catch(() => alert('Could not decode this audio file.'));
        }
      }}
    >
      {mine.length === 0 && (
        <div className="pointer-events-none sticky left-0 flex h-full w-[min(100%,700px)] items-center justify-center gap-2 text-[11.5px] text-t3">
          <def.Icon size={12} />
          {def.hint}
        </div>
      )}
      {mine.map((c) => <ClipBlock key={c.id} clip={c} pxPerSec={pxPerSec} onSnap={setSnapLine} />)}
      {lane === 'voice' && rec.active && (
        <div
          className="pointer-events-none absolute top-1 bottom-1 rounded-md border-2 border-dashed border-[#e05a6d] bg-[#fdeef0]/70"
          style={{ left: rec.startedAt * pxPerSec, width: Math.max(2, (currentTime - rec.startedAt) * pxPerSec) }}
        />
      )}
      {snapLine !== null && (
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff4d8d]" style={{ left: snapLine * pxPerSec }} />
      )}
      <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: currentTime * pxPerSec }} />
    </div>
  );
}

/** The requested audio lanes on the shared time axis. */
export function AudioLanes({ pxPerSec, width, lanes }: { pxPerSec: number; width: number; lanes: AudioLaneKind[] }) {
  return (
    <div className="flex flex-col gap-1">
      {LANES.filter((l) => lanes.includes(l.kind)).map((l) => <Lane key={l.kind} lane={l.kind} width={width} pxPerSec={pxPerSec} />)}
    </div>
  );
}
