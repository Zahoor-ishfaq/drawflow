import { Music, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { decodeAudioFile, setAudioVolume } from '../../lib/audioEngine';
import { Field } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';

export function AudioPanel() {
  const audio = useStore((s) => s.audio);
  const { setAudio, updateAudio } = useStore.getState();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      setAudio({
        id: crypto.randomUUID(),
        name: file.name,
        buffer,
        url: URL.createObjectURL(file),
        startTime: 0,
        volume: 1,
      });
    } catch {
      alert('Could not decode this audio file.');
    }
  };

  if (!audio) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[12.5px] text-t3 hover:border-accent hover:text-accent">
          <Music size={20} />
          Add a soundtrack (MP3, WAV…)
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <p className="text-[11.5px] leading-relaxed text-t3">
          The soundtrack plays under your animation and is included in the
          exported video.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-panel2 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
          <Music size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium">{audio.name}</div>
          <div className="tabular text-[11px] text-t3">
            {audio.buffer ? `${audio.buffer.duration.toFixed(1)} s` : '—'}
          </div>
        </div>
      </div>
      <Field label="Volume">
        <Slider
          value={audio.volume}
          onChange={(v) => {
            updateAudio({ volume: v });
            setAudioVolume(v);
          }}
          min={0} max={1} step={0.01} precision={2}
        />
      </Field>
      <Field label="Starts at (seconds)">
        <NumberInput
          value={audio.startTime}
          onChange={(v) => updateAudio({ startTime: Math.max(0, v) })}
          min={0} step={0.1} precision={1}
        />
      </Field>
      <Button
        variant="secondary"
        className="justify-center text-red-500"
        onClick={() => {
          URL.revokeObjectURL(audio.url);
          setAudio(null);
        }}
      >
        <Trash2 size={14} />
        Remove soundtrack
      </Button>
    </div>
  );
}
