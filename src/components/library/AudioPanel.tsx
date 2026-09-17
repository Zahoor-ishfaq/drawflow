import { useState } from 'react';
import { Mic, Music } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { importAudioFile, clipSelectionId } from '../timeline/AudioLane';
import { startRecording, useRecorder } from '../../lib/recorder';
import { Button } from '../ui/Button';

export function AudioPanel({ onAdded }: { onAdded?: () => void }) {
  const clips = useStore((s) => s.audioClips);
  const currentTime = useStore((s) => s.currentTime);
  const rec = useRecorder();
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await importAudioFile(file, 'music', 0);
      onAdded?.();
    } catch {
      setError('Could not decode this audio file.');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[12.5px] text-t3 hover:border-accent hover:text-accent">
        <Music size={20} />
        Add music (MP3, WAV, M4A…)
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && <div className="text-[12px] text-red-500">{error}</div>}

      <Button
        variant="secondary"
        className="justify-center text-[#c8434f]"
        disabled={rec.active}
        onClick={() => { onAdded?.(); void startRecording(); }}
      >
        <Mic size={14} />
        Record voiceover from {currentTime.toFixed(1)} s
      </Button>
      {rec.error && <div className="text-[12px] text-red-500">{rec.error}</div>}

      <p className="text-[11.5px] leading-relaxed text-t3">
        Clips sit on the two lanes under the scrub bar (music, voiceover). Drag a clip to
        move it, drag its ends to trim, click it to set volume, fades and mute, or split it at
        the playhead. Recording plays the scribe while you narrate and stops when it ends.
      </p>

      {clips.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">On the timeline</div>
          {clips.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-left hover:border-accent"
              onClick={() => useStore.getState().select(clipSelectionId(c.id))}
            >
              {c.lane === 'voice' ? <Mic size={12} className="shrink-0 text-[#e05a6d]" /> : <Music size={12} className="shrink-0 text-accent" />}
              <span className="min-w-0 flex-1 truncate text-[12px]">{c.name}</span>
              <span className="tabular text-[10.5px] text-t3">{c.startTime.toFixed(1)}s · {c.duration.toFixed(1)}s</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
