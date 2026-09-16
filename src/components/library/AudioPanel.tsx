import { Music, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clipLength, decodeAudioFile } from '../../lib/audioEngine';
import { AUDIO_SELECTION_ID } from '../timeline/AudioLane';
import { Button } from '../ui/Button';

export function AudioPanel({ onAdded }: { onAdded?: () => void }) {
  const audio = useStore((s) => s.audio);
  const { setAudio, select } = useStore.getState();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      setAudio({
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
      select(AUDIO_SELECTION_ID);
      onAdded?.();
    } catch {
      alert('Could not decode this audio file.');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {audio && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel2 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
            <Music size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{audio.name}</div>
            <div className="tabular text-[11px] text-t3">
              {clipLength(audio).toFixed(1)} s on the timeline · {audio.duration.toFixed(1)} s file
            </div>
          </div>
        </div>
      )}
      <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[12.5px] text-t3 hover:border-accent hover:text-accent">
        <Music size={20} />
        {audio ? 'Replace soundtrack (MP3, WAV…)' : 'Add a soundtrack (MP3, WAV…)'}
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {audio ? (
        <>
          <p className="text-[11.5px] leading-relaxed text-t3">
            The music sits on the lane under the scrub bar. Drag it to move it, drag its ends
            to cut, and click it to adjust volume and timing.
          </p>
          <Button
            variant="secondary"
            className="justify-center text-red-500"
            onClick={() => {
              URL.revokeObjectURL(audio.url);
              setAudio(null);
              select(null);
            }}
          >
            <Trash2 size={14} />
            Remove soundtrack
          </Button>
        </>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-t3">
          The soundtrack plays under your animation and is included in the exported video.
        </p>
      )}
    </div>
  );
}
