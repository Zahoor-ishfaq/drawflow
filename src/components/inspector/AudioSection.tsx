import { useEffect, useState } from 'react';
import { Captions, Copy, Headphones, Scissors, Sparkles, Trash2, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAudioSource } from '../../store/audioSources';
import { setClipVolume } from '../../lib/audioEngine';
import { cleanVoice, clipCaptions, normalizeGain } from '../../lib/audioTools';
import { transcribe } from '../../lib/ai/speech';
import { useAiSettings } from '../../lib/ai/settings';
import { reportAiError } from '../../store/problemStore';
import { Field, SectionHeader } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';
import type { AudioClip, AudioSource } from '../../types';

/** The words spoken in a voice clip: subtitles are timed from them. */
function ClipWords({ clip, source }: { clip: AudioClip; source: AudioSource | undefined }) {
  const ai = useAiSettings();
  const [text, setText] = useState(clip.transcript ?? '');
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setText(clip.transcript ?? ''), [clip.id, clip.transcript]);
  const provider = ai.keys.groq ? 'groq' : ai.keys.openai ? 'openai' : null;

  const save = (words: string) => {
    if (source && words.trim() !== (clip.transcript ?? '')) useStore.getState().updateAudioClip(clip.id, clipCaptions(source.buffer, words));
  };

  const listen = async () => {
    if (!source || !provider || listening) return;
    setListening(true);
    setNote(null);
    try {
      const t = await transcribe(provider, ai.keys[provider], source.blob, source.blob.type.includes('webm') ? 'audio.webm' : 'audio.wav');
      setText(t.text);
      save(t.text);
    } catch (e) {
      setNote(reportAiError(e, provider, 'transcribe').title);
    } finally {
      setListening(false);
    }
  };

  return (
    <Field label="Words spoken (for subtitles)">
      <textarea
        className="df-input min-h-[72px] resize-y py-1.5 leading-snug"
        value={text}
        placeholder="Type or paste what is said in this clip."
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save(text)}
      />
      {provider && (
        <Button variant="secondary" className="mt-1.5 w-full justify-center" disabled={!source || listening} onClick={() => void listen()}
          title="Send the audio to your transcription service and fill in the words">
          <Captions size={13} /> {listening ? 'Listening…' : 'Write the words from the audio'}
        </Button>
      )}
      {note && <p className="mt-1 text-[11px] text-red-500">{note}</p>}
    </Field>
  );
}

const LANE_TITLES = { voice: 'Voiceover clip', music: 'Music clip', sfx: 'Sound effect' } as const;

export function AudioSection({ clip }: { clip: AudioClip }) {
  const currentTime = useStore((s) => s.currentTime);
  const source = useAudioSource(clip.sourceId);
  const scenes = useStore((s) => s.project.scenes ?? []);
  const { updateAudioClip, removeAudioClip, duplicateAudioClip, splitAudioClip, select } = useStore.getState();
  const [busy, setBusy] = useState<string | null>(null);
  const patch = (p: Partial<AudioClip>) => updateAudioClip(clip.id, p);
  const canSplit = currentTime > clip.startTime + 0.05 && currentTime < clip.startTime + clip.duration - 0.05;
  const end = clip.startTime + clip.duration;

  const normalize = () => {
    if (!source) return;
    const v = normalizeGain(source.buffer, clip.offset, clip.offset + clip.duration);
    patch({ volume: v });
    setClipVolume(clip.id, v);
  };

  const clean = async () => {
    if (!source || busy) return;
    setBusy('clean');
    try {
      const cleaned = await cleanVoice(source);
      patch({ sourceId: cleaned.id, name: clip.name.endsWith('(clean)') ? clip.name : `${clip.name} (clean)` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>{LANE_TITLES[clip.lane] ?? 'Audio clip'}</SectionHeader>
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
          <Scissors size={13} /> Split
        </Button>
        <Button variant="secondary" className="justify-center" onClick={() => patch({ muted: !clip.muted })}>
          {clip.muted ? <VolumeX size={13} /> : <Volume2 size={13} />} {clip.muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button variant="secondary" className={'justify-center ' + (clip.solo ? '!bg-accent-weak !text-accent' : '')} onClick={() => patch({ solo: !clip.solo })} title="Hear only soloed clips">
          <Headphones size={13} /> {clip.solo ? 'Solo on' : 'Solo'}
        </Button>
        <Button variant="secondary" className="justify-center" onClick={normalize} disabled={!source} title="Set the volume so the loudest moment peaks at 90%">
          <Wand2 size={13} /> Normalise
        </Button>
      </div>
      {!canSplit && (
        <p className="text-[10.5px] text-t3">Move the playhead inside the clip to split it.</p>
      )}
      {clip.lane === 'voice' && (
        <Button variant="secondary" className="justify-center" onClick={() => void clean()} disabled={!source || !!busy}
          title="High-pass filter plus a noise gate: removes room noise between sentences">
          <Sparkles size={13} /> {busy === 'clean' ? 'Cleaning…' : 'Clean up background noise'}
        </Button>
      )}
      {clip.lane === 'voice' && <ClipWords clip={clip} source={source} />}

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
      {scenes.length > 0 && (
        <Field label="Belongs to scene (moves with it)">
          <select className="df-input" value={clip.sceneId ?? ''} onChange={(e) => patch({ sceneId: e.target.value || undefined })}>
            <option value="">— none —</option>
            {scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        </Field>
      )}

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
