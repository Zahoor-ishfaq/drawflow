import { Copy, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAudioSource } from '../../store/audioSources';
import { setClipVolume } from '../../lib/audioEngine';
import { Field, SectionHeader } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';
import type { AudioClip } from '../../types';

export function AudioSection({ clip }: { clip: AudioClip }) {
  const currentTime = useStore((s) => s.currentTime);
  const source = useAudioSource(clip.sourceId);
  const { updateAudioClip, removeAudioClip, duplicateAudioClip, splitAudioClip, select } = useStore.getState();
  const patch = (p: Partial<AudioClip>) => updateAudioClip(clip.id, p);
  const canSplit = currentTime > clip.startTime + 0.05 && currentTime < clip.startTime + clip.duration - 0.05;
  const end = clip.startTime + clip.duration;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>{clip.lane === 'voice' ? 'Voiceover clip' : 'Music clip'}</SectionHeader>
      <Field label="Name">
        <input type="text" className="df-input" value={clip.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <p className="tabular text-[11px] text-t3">
        {clip.startTime.toFixed(1)} s → {end.toFixed(1)} s on the timeline · {clip.duration.toFixed(1)} s
        {source ? ` of a ${source.duration.toFixed(1)} s file (from ${clip.offset.toFixed(1)} s)` : ''}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-center" disabled={!canSplit}
          title="Cut this clip in two at the playhead (S)"
          onClick={() => splitAudioClip(clip.id, currentTime)}>
          <Scissors size={13} /> Split at playhead
        </Button>
        <Button variant="secondary" className="justify-center" onClick={() => patch({ muted: !clip.muted })}>
          {clip.muted ? <VolumeX size={13} /> : <Volume2 size={13} />} {clip.muted ? 'Unmute' : 'Mute'}
        </Button>
      </div>
      {!canSplit && (
        <p className="text-[10.5px] text-t3">Move the playhead inside the clip to split it.</p>
      )}

      <Field label="Volume">
        <Slider
          value={clip.volume}
          onChange={(v) => { patch({ volume: v }); setClipVolume(clip.id, v); }}
          min={0} max={1.5} step={0.01} precision={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fade in (s)">
          <NumberInput value={clip.fadeIn} onChange={(v) => patch({ fadeIn: Math.max(0, Math.min(v, clip.duration / 2)) })} min={0} step={0.1} precision={1} />
        </Field>
        <Field label="Fade out (s)">
          <NumberInput value={clip.fadeOut} onChange={(v) => patch({ fadeOut: Math.max(0, Math.min(v, clip.duration / 2)) })} min={0} step={0.1} precision={1} />
        </Field>
      </div>
      <Field label="Starts at (seconds on the timeline)">
        <NumberInput value={clip.startTime} onChange={(v) => patch({ startTime: Math.max(0, v) })} min={0} step={0.1} precision={1} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Skip from file start (s)">
          <NumberInput
            value={clip.offset}
            onChange={(v) => {
              const max = source ? Math.max(0, source.duration - 0.2) : v;
              const offset = Math.max(0, Math.min(v, max));
              const duration = source ? Math.min(clip.duration, source.duration - offset) : clip.duration;
              patch({ offset, duration });
            }}
            min={0} step={0.1} precision={1}
          />
        </Field>
        <Field label="Length (s)">
          <NumberInput
            value={clip.duration}
            onChange={(v) => patch({ duration: Math.max(0.2, source ? Math.min(v, source.duration - clip.offset) : v) })}
            min={0.2} step={0.1} precision={1}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-center" onClick={() => duplicateAudioClip(clip.id)}>
          <Copy size={13} /> Duplicate
        </Button>
        <Button variant="secondary" className="justify-center text-red-500" onClick={() => { removeAudioClip(clip.id); select(null); }}>
          <Trash2 size={13} /> Delete
        </Button>
      </div>
    </div>
  );
}
