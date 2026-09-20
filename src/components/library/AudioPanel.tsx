import { useState } from 'react';
import { AudioLines, Mic, Music, Play, Plus, Sparkles, Volume2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { audioContext, decodeToSource, getSource } from '../../store/audioSources';
import { importAudioFile, clipSelectionId } from '../timeline/AudioLane';
import { startRecording, useRecorder } from '../../lib/recorder';
import { SFX, previewSfx, sfxSource } from '../../lib/audioTools';
import { fitToPhrases, narrationPhrases } from '../../lib/narration';
import { synthesizeSpeech, transcribe, TTS_MODELS, type SpeechProvider } from '../../lib/ai/speech';
import { useAiSettings } from '../../lib/ai/settings';
import { reportAiError } from '../../store/problemStore';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { SectionHeader } from '../ui/Field';
import type { AudioClip } from '../../types';

function addClip(sourceId: string, name: string, lane: AudioClip['lane'], duration: number, at: number): void {
  useStore.getState().addAudioClip({
    id: crypto.randomUUID(), name, lane, sourceId, startTime: Math.max(0, at), offset: 0, duration,
    volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
  });
}

/** AI voice: type the narration, pick a provider/voice, drop it on the voice lane. */
function AiVoice({ at }: { at: number }) {
  const ai = useAiSettings();
  const available = (['openai', 'groq', 'gemini'] as SpeechProvider[]).filter((p) => ai.keys[p]);
  const [provider, setProvider] = useState<SpeechProvider>(available[0] ?? 'openai');
  const [voice, setVoice] = useState(TTS_MODELS[available[0] ?? 'openai'].voices[0].id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speak = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await synthesizeSpeech(provider, ai.keys[provider], text.trim(), voice);
      const src = await decodeToSource(blob, `AI voice — ${text.trim().slice(0, 28)}`);
      addClip(src.id, src.name, 'voice', src.duration, at);
    } catch (e) {
      setError(reportAiError(e, provider).title);
    } finally {
      setBusy(false);
    }
  };

  if (available.length === 0) {
    return (
      <p className="text-[11.5px] leading-relaxed text-t3">
        AI voice: add an OpenAI, Groq or Gemini key in the AI panel's settings to generate narration from text.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">AI voice</div>
      <textarea className="df-input min-h-[60px] resize-y" placeholder="What should the voice say?" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Service">
          <select className="df-input" value={provider} onChange={(e) => { const p = e.target.value as SpeechProvider; setProvider(p); setVoice(TTS_MODELS[p].voices[0].id); }}>
            {available.map((p) => <option key={p} value={p}>{p === 'openai' ? 'OpenAI' : p === 'groq' ? 'Groq (PlayAI)' : 'Gemini'}</option>)}
          </select>
        </Field>
        <Field label="Voice">
          <select className="df-input" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {TTS_MODELS[provider].voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      {error && <div className="text-[11.5px] text-red-500">{error}</div>}
      <Button variant="secondary" className="justify-center" disabled={busy || !text.trim()} onClick={() => void speak()}>
        <Sparkles size={13} /> {busy ? 'Generating…' : `Generate voice at ${at.toFixed(1)} s`}
      </Button>
    </div>
  );
}

export function AudioPanel({ onAdded }: { onAdded?: () => void }) {
  const clips = useStore((s) => s.audioClips);
  const elements = useStore((s) => s.elements);
  const currentTime = useStore((s) => s.currentTime);
  const rec = useRecorder();
  const ai = useAiSettings();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const voiceClips = clips.filter((c) => c.lane === 'voice' && !c.muted);

  const onFile = async (file: File | undefined, lane: AudioClip['lane']) => {
    if (!file) return;
    setError(null);
    try {
      await importAudioFile(file, lane, lane === 'music' ? 0 : currentTime);
      onAdded?.();
    } catch {
      setError('Could not decode this audio file.');
    }
  };

  const addSfx = async (id: string) => {
    const src = await sfxSource(id);
    addClip(src.id, src.name, 'sfx', src.duration, currentTime);
  };

  /** Offline: phrase boundaries from silences in the voice lane. */
  const fitOffline = () => {
    const s = useStore.getState();
    const phrases = narrationPhrases(s.audioClips);
    const ordered = [...s.elements].sort((a, b) => a.zIndex - b.zIndex);
    if (phrases.length === 0) { setFitNote('No speech found on the voice lane.'); return; }
    const patches = fitToPhrases(ordered, phrases);
    for (const [id, p] of patches) s.updateElement(id, p);
    setFitNote(`Matched ${patches.size} elements to ${phrases.length} phrases.`);
  };

  /** AI: sentence timestamps from a transcript (OpenAI / Groq Whisper). */
  const fitTranscript = async () => {
    const provider = ai.keys.groq ? 'groq' : ai.keys.openai ? 'openai' : null;
    if (!provider) { setFitNote('Add a Groq or OpenAI key for transcription.'); return; }
    setBusy('transcribe');
    setFitNote(null);
    try {
      const s = useStore.getState();
      const phrases: { start: number; end: number }[] = [];
      for (const c of voiceClips) {
        const src = getSource(c.sourceId);
        if (!src) continue;
        const t = await transcribe(provider, ai.keys[provider], src.blob, src.blob.type.includes('webm') ? 'audio.webm' : 'audio.wav');
        for (const seg of t.segments) {
          if (seg.end <= c.offset || seg.start >= c.offset + c.duration) continue;
          phrases.push({ start: c.startTime + Math.max(0, seg.start - c.offset), end: c.startTime + Math.min(c.duration, seg.end - c.offset) });
        }
      }
      phrases.sort((a, b) => a.start - b.start);
      const ordered = [...s.elements].sort((a, b) => a.zIndex - b.zIndex);
      const patches = fitToPhrases(ordered, phrases);
      for (const [id, p] of patches) s.updateElement(id, p);
      setFitNote(`Transcribed ${phrases.length} sentences; matched ${patches.size} elements.`);
    } catch (e) {
      setFitNote(reportAiError(e, provider).title);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <SectionHeader>Voiceover</SectionHeader>
      <Button
        variant="primary"
        className="justify-center"
        disabled={rec.active}
        onClick={() => { onAdded?.(); void startRecording(); }}
        title="The scribe plays from the playhead while you narrate; the take lands on the Voice lane"
      >
        <Mic size={14} />
        Record from {currentTime.toFixed(1)} s
      </Button>
      {rec.error && <div className="text-[12px] text-red-500">{rec.error}</div>}
      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[12px] text-t3 hover:border-accent hover:text-accent">
        <Mic size={14} />
        Upload a recording (MP3, WAV, M4A…) at {currentTime.toFixed(1)} s
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0], 'voice'); e.target.value = ''; }} />
      </label>
      <AiVoice at={currentTime} />
      {error && <div className="text-[12px] text-red-500">{error}</div>}

      <SectionHeader>Music</SectionHeader>
      <label className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-[12.5px] text-t3 hover:border-accent hover:text-accent">
        <Music size={16} />
        Add music (MP3, WAV, M4A…) — starts at 0 s
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0], 'music'); e.target.value = ''; }} />
      </label>

      <SectionHeader>Sound effects</SectionHeader>
      <div className="grid grid-cols-2 gap-1">
        {SFX.map((fx) => (
          <div key={fx.id} className="flex items-center gap-1 rounded-lg border border-line bg-panel2 px-1.5 py-1">
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-white hover:text-accent" title="Preview" onClick={() => void previewSfx(fx.id, audioContext())}>
              <Play size={11} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[11.5px]">{fx.name}</span>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-white hover:text-accent" title={`Add at ${currentTime.toFixed(1)} s`} onClick={() => void addSfx(fx.id)}>
              <Plus size={12} />
            </button>
          </div>
        ))}
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-1.5 text-[11.5px] text-t3 hover:border-accent hover:text-accent">
        <Volume2 size={12} /> Add your own effect at {currentTime.toFixed(1)} s
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0], 'sfx'); e.target.value = ''; }} />
      </label>

      <SectionHeader>Sync with narration</SectionHeader>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-center" disabled={voiceClips.length === 0 || elements.length === 0} onClick={fitOffline}
          title="Detect the pauses in the voiceover and give each element one phrase (offline)">
          <AudioLines size={13} /> Fit to pauses
        </Button>
        <Button variant="secondary" className="justify-center" disabled={voiceClips.length === 0 || elements.length === 0 || !!busy} onClick={() => void fitTranscript()}
          title="Transcribe the voiceover (Groq or OpenAI Whisper) and align elements to its sentences">
          <Sparkles size={13} /> {busy ? 'Transcribing…' : 'Fit to sentences (AI)'}
        </Button>
      </div>
      {fitNote && <div className="text-[11.5px] text-t2">{fitNote}</div>}
      <p className="text-[11.5px] leading-relaxed text-t3">
        Each element's drawing time and pause are retimed so element 1 goes with phrase 1, and so on.
        Undo (Ctrl+Z) puts the old timing back.
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
              {c.lane === 'voice' ? <Mic size={12} className="shrink-0 text-[#e05a6d]" /> : c.lane === 'sfx' ? <Volume2 size={12} className="shrink-0 text-[#e0722f]" /> : <Music size={12} className="shrink-0 text-accent" />}
              <span className="min-w-0 flex-1 truncate text-[12px]">{c.name}</span>
              <span className="tabular text-[10.5px] text-t3">{c.startTime.toFixed(1)}s · {c.duration.toFixed(1)}s</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
