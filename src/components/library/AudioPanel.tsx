import { useEffect, useState } from 'react';
import { AudioLines, Mic, Music, Play, Plus, RefreshCw, Sparkles, Volume2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { audioContext, decodeToSource, getSource } from '../../store/audioSources';
import { importAudioFile, clipSelectionId } from '../timeline/AudioLane';
import { startRecording, useRecorder } from '../../lib/recorder';
import { SFX, previewSfx, sfxSource } from '../../lib/audioTools';
import { fitToPhrases, narrationPhrases } from '../../lib/narration';
import { hasBuiltInVoice, isLocalNotSetUp, SPEECH_LABELS, speechKey, speechProviders, synthesizeSpeech, transcribe, voicesFor, type SpeechProvider } from '../../lib/ai/speech';
import { getAiSettings, updateAiSettings, useAiSettings } from '../../lib/ai/settings';
import { reportAiError } from '../../store/problemStore';
import { useLocalVoice } from '../../store/localVoiceStore';
import { useBuiltInVoice } from '../../store/builtInVoiceStore';
import { LOCAL_APPS } from '../dialogs/LocalVoiceGuide';
import { Segmented } from '../ui/Segmented';
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

/** Only the first time the voice-app option finds nothing is the setup popup opened by itself. */
let guideShownOnce = false;

/**
 * AI voice: type the narration, then speak it Online (a provider with a key)
 * or Offline — with the built-in voice (desktop app) or a voice app on this
 * computer — and drop it on the voice lane.
 */
function AiVoice({ at }: { at: number }) {
  const ai = useAiSettings();
  const builtIn = hasBuiltInVoice();
  const cloud: SpeechProvider[] = speechProviders(ai).filter((p) => p !== 'local' && p !== 'kokoro');
  const local = useLocalVoice();
  const model = useBuiltInVoice();
  const [mode, setMode] = useState<'online' | 'offline'>(() => (cloud.length === 0 && (builtIn || ai.localVoice.enabled) ? 'offline' : 'online'));
  // the web version has no built-in voice, only the voice-app option
  const engine = builtIn ? ai.offlineEngine : 'app';
  const setEngine = (e: 'builtin' | 'app') => { updateAiSettings({ offlineEngine: e }); setError(null); };
  // the chosen provider only counts while it has a key — otherwise the first provider that does
  // (keys can be added after this panel mounted, so this is derived, not frozen in state)
  const [chosenProvider, setProvider] = useState<SpeechProvider | null>(null);
  const provider: SpeechProvider = mode === 'offline'
    ? (engine === 'builtin' ? 'kokoro' : 'local')
    : chosenProvider && cloud.includes(chosenProvider) ? chosenProvider : (cloud[0] ?? 'openai');
  const voices = voicesFor(provider, ai);
  const [chosenVoice, setVoice] = useState<string | null>(null);
  const voice = chosenVoice && voices.some((v) => v.id === chosenVoice) ? chosenVoice : voices[0].id;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appName = LOCAL_APPS.find((a) => a.url === ai.localVoice.url)?.name ?? 'your voice app';

  useEffect(() => {
    if (mode !== 'offline') return;
    if (engine === 'builtin') { void useBuiltInVoice.getState().refresh(); return; }
    // the voice-app option looks for the app; the first time nothing answers, the popup explains what to install
    const st = useLocalVoice.getState();
    if (st.status === 'connected' || st.status === 'checking') return;
    void st.check().then((ok) => {
      if (!ok && !guideShownOnce) { guideShownOnce = true; useLocalVoice.getState().openGuide(); }
    });
  }, [mode, engine]);

  const speak = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // a voice app must be running first — if it isn't, explain how to get it instead of failing
      if (provider === 'local' && useLocalVoice.getState().status !== 'connected' && !(await useLocalVoice.getState().check())) {
        useLocalVoice.getState().openGuide();
        return;
      }
      const blob = await synthesizeSpeech(provider, speechKey(provider, getAiSettings()), text.trim(), voice);
      const src = await decodeToSource(blob, `AI voice — ${text.trim().slice(0, 28)}`);
      addClip(src.id, src.name, 'voice', src.duration, at);
    } catch (e) {
      if (provider === 'local' && isLocalNotSetUp(e)) {
        // it was there and has gone (closed, crashed): back to the setup popup
        useLocalVoice.setState({ status: 'offline' });
        useLocalVoice.getState().openGuide();
      } else {
        setError(reportAiError(e, provider, 'voice').title);
      }
    } finally {
      setBusy(false);
      if (provider === 'kokoro') void useBuiltInVoice.getState().refresh();
    }
  };

  const busyLabel = provider === 'kokoro' && model.progress !== null
    ? `Downloading the voice model… ${model.progress}%`
    : provider === 'kokoro' && model.downloaded === false ? 'Preparing the built-in voice…' : 'Generating…';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">AI voice</div>
        <Segmented<'online' | 'offline'>
          className="w-[190px]"
          value={mode}
          onChange={(m) => { setMode(m); setError(null); }}
          options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline (free)' }]}
        />
      </div>
      <textarea className="df-input min-h-[60px] resize-y" placeholder="What should the voice say?" value={text} onChange={(e) => setText(e.target.value)} />

      {mode === 'online' ? (
        cloud.length === 0 ? (
          <p className="text-[11.5px] leading-relaxed text-t3">
            Online voices need an OpenAI, Groq or Gemini key — add one under AI → gear. Or use the{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => setMode('offline')}>Offline</button>{' '}
            tab: free, private, runs on this computer.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Service">
              <select className="df-input" value={provider} onChange={(e) => { const p = e.target.value as SpeechProvider; setProvider(p); setVoice(voicesFor(p, ai)[0].id); }}>
                {cloud.map((p) => <option key={p} value={p}>{SPEECH_LABELS[p]}</option>)}
              </select>
            </Field>
            <Field label="Voice">
              <select className="df-input" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
          </div>
        )
      ) : (
        <>
          {builtIn ? (
            <Segmented<'builtin' | 'app'>
              value={engine}
              onChange={setEngine}
              options={[{ value: 'builtin', label: 'Built-in voice' }, { value: 'app', label: 'Voice app (cloning)' }]}
            />
          ) : (
            <p className="text-[11px] leading-relaxed text-t3">The ready-to-use built-in voice comes with the DrawFlow desktop app. Here you can use a voice app on this computer.</p>
          )}

          {engine === 'builtin' ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11.5px]">
              <div className="flex items-center gap-2">
                <span className={'h-2 w-2 shrink-0 rounded-full ' + (model.downloaded ? 'bg-accent' : model.progress !== null ? 'bg-amber-400' : 'bg-t3')} />
                <span className="min-w-0 flex-1 text-t2">
                  {model.progress !== null ? `Downloading the voice model… ${model.progress}%`
                    : model.downloaded ? 'Ready — works without internet, nothing to install'
                      : 'Downloads once on first use (about 92 MB), then works offline'}
                </span>
              </div>
              {model.progress !== null && (
                <div className="h-1 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${model.progress}%` }} /></div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11.5px]">
              <span className={'h-2 w-2 shrink-0 rounded-full ' + (local.status === 'connected' ? 'bg-accent' : local.status === 'checking' ? 'bg-amber-400' : 'bg-t3')} />
              <span className="min-w-0 flex-1 truncate text-t2">
                {local.status === 'connected' ? `Connected to ${appName} on this computer`
                  : local.status === 'checking' ? 'Looking for a voice app on this computer…'
                    : local.status === 'error' ? `${appName} answered with a problem`
                      : 'No voice app found on this computer'}
              </span>
              {local.status === 'connected' ? (
                <button type="button" className="text-t3 hover:text-accent" title="Check again and reload the voices" onClick={() => void local.check()}>
                  <RefreshCw size={12} />
                </button>
              ) : (
                <button type="button" className="shrink-0 font-medium text-accent hover:underline" onClick={local.openGuide}>Set up</button>
              )}
            </div>
          )}
          <Field label="Voice">
            <select className="df-input" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>
          {engine === 'builtin' ? (
            <p className="text-[11px] leading-relaxed text-t3">
              English voices, made on this computer. For your own cloned voice, use a{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => setEngine('app')}>voice app</button>.
            </p>
          ) : (
            <button type="button" className="self-start text-[11px] text-t3 hover:text-accent hover:underline" onClick={local.openGuide}>
              What is this? Download &amp; setup help
            </button>
          )}
        </>
      )}

      {error && <div className="text-[11.5px] text-red-500">{error}</div>}
      <Button variant="secondary" className="justify-center" disabled={busy || !text.trim() || (mode === 'online' && cloud.length === 0)} onClick={() => void speak()}>
        <Sparkles size={13} /> {busy ? busyLabel : `Generate ${mode === 'offline' ? 'offline ' : ''}voice at ${at.toFixed(1)} s`}
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
      setFitNote(reportAiError(e, provider, 'transcribe').title);
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
