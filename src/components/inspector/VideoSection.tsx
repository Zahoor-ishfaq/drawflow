import { useState } from 'react';
import { Music2, Timer } from 'lucide-react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { audioContext, decodeToSource } from '../../store/audioSources';
import { encodeWav } from '../../lib/audioMix';
import { Field, SectionHeader } from '../ui/Field';
import { Slider } from '../ui/Slider';

/** The part of the clip that plays, in seconds. */
function playingLength(el: DrawElement): number {
  const v = el.video!;
  return Math.max(0.1, v.duration - (v.start ?? 0));
}

/** Playback of a video clip on the board: where it starts, looping, its sound. */
export function VideoSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v = el.video!;
  const length = playingLength(el);
  const onScreen = el.drawDuration + el.pauseAfter;

  const patchVideo = (p: Partial<NonNullable<DrawElement['video']>>) => updateElement(el.id, { video: { ...v, ...p } });

  const fitTiming = () => {
    updateElement(el.id, { pauseAfter: Math.max(0.2, Math.round((length - el.drawDuration) * 100) / 100) });
    setNote(null);
  };

  const addSound = async () => {
    setBusy(true);
    setNote(null);
    try {
      const file = await (await fetch(v.src)).blob();
      let buffer: AudioBuffer;
      try {
        buffer = await audioContext().decodeAudioData(await file.arrayBuffer());
      } catch {
        throw new Error('This video has no sound to add.');
      }
      // keep just the sound (a WAV), not a second copy of the whole video
      const source = await decodeToSource(new Blob([encodeWav(buffer) as BlobPart], { type: 'audio/wav' }), `${el.label} (sound)`);
      const start = Math.min(v.start ?? 0, source.duration);
      useStore.getState().addAudioClip({
        id: crypto.randomUUID(),
        name: `${el.label} (sound)`,
        lane: 'sfx',
        sourceId: source.id,
        startTime: el.startTime,
        offset: start,
        duration: Math.max(0.05, Math.min(source.duration - start, v.loop ? onScreen : length)),
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        muted: false,
      });
      setNote('Added to the Sfx lane, starting with the clip. If you move the clip, move its sound too.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not read the sound of this video.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader>Video</SectionHeader>
      <p className="-mt-1 mb-2 text-[11px] leading-relaxed text-t3">
        {v.duration.toFixed(1)} s clip. It stays still while you edit, and plays in Camera view, Preview and the video.
      </p>
      <Field label="Start from (seconds into the clip)">
        <Slider value={v.start ?? 0} onChange={(s) => patchVideo({ start: Math.max(0, Math.min(s, v.duration - 0.1)) })} min={0} max={Math.max(0.1, v.duration - 0.1)} step={0.1} precision={1} />
      </Field>
      <label className="mt-1 mb-2 flex items-center gap-2 text-[12px] text-t2">
        <input type="checkbox" checked={!!v.loop} onChange={(e) => patchVideo({ loop: e.target.checked })} />
        Loop (otherwise it stops on the last frame)
      </label>
      <div className="mb-3 flex flex-col gap-1.5">
        {!v.loop && Math.abs(onScreen - length) > 0.15 && (
          <button
            type="button"
            className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-line text-[12px] text-t1 hover:bg-hov"
            title="Set the pause so the board waits until the clip has played to the end"
            onClick={fitTiming}
          >
            <Timer size={13} /> Wait for the clip to finish ({length.toFixed(1)} s)
          </button>
        )}
        <button
          type="button"
          className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-line text-[12px] text-t1 hover:bg-hov disabled:opacity-40"
          disabled={busy || v.hasAudio === false}
          title="The board itself is silent: this puts the clip's sound on the timeline, where you can trim it or change its volume"
          onClick={() => void addSound()}
        >
          <Music2 size={13} /> {busy ? 'Reading the sound…' : 'Add its sound to the timeline'}
        </button>
        {note && <p className="text-[11px] leading-relaxed text-t3">{note}</p>}
      </div>
    </>
  );
}
