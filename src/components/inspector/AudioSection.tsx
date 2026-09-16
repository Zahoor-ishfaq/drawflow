import { Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { clipLength, setAudioVolume } from '../../lib/audioEngine';
import { Field, SectionHeader } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';

export function AudioSection() {
  const audio = useStore((s) => s.audio);
  const { updateAudio, setAudio, select } = useStore.getState();
  if (!audio) return null;
  const len = clipLength(audio);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Music</SectionHeader>
      <div className="truncate text-[12.5px] font-medium">{audio.name}</div>
      <p className="tabular text-[11px] text-t3">
        {len.toFixed(1)} s on the timeline · from {audio.trimStart.toFixed(1)} s to{' '}
        {(audio.duration - audio.trimEnd).toFixed(1)} s of the file
      </p>
      <Field label="Volume">
        <Slider
          value={audio.volume}
          onChange={(v) => { updateAudio({ volume: v }); setAudioVolume(v); }}
          min={0} max={1} step={0.01} precision={2}
        />
      </Field>
      <Field label="Starts at (seconds on the timeline)">
        <NumberInput value={audio.startTime} onChange={(v) => updateAudio({ startTime: Math.max(0, v) })} min={0} step={0.1} precision={1} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cut from start (s)">
          <NumberInput
            value={audio.trimStart}
            onChange={(v) => updateAudio({ trimStart: Math.min(Math.max(0, v), audio.duration - audio.trimEnd - 0.5) })}
            min={0} step={0.1} precision={1}
          />
        </Field>
        <Field label="Cut from end (s)">
          <NumberInput
            value={audio.trimEnd}
            onChange={(v) => updateAudio({ trimEnd: Math.min(Math.max(0, v), audio.duration - audio.trimStart - 0.5) })}
            min={0} step={0.1} precision={1}
          />
        </Field>
      </div>
      <Button
        variant="secondary"
        className="justify-center text-red-500"
        onClick={() => { URL.revokeObjectURL(audio.url); setAudio(null); select(null); }}
      >
        <Trash2 size={14} />
        Remove soundtrack
      </Button>
    </div>
  );
}
