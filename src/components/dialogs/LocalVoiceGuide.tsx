import { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, HardDrive, Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { getAiSettings, updateAiSettings, useAiSettings } from '../../lib/ai/settings';
import { useLocalVoice } from '../../store/localVoiceStore';

/** The voice apps DrawFlow knows how to talk to, with where they listen by default. */
export const LOCAL_APPS = [
  {
    id: 'voicestudio',
    name: 'VoiceStudio',
    url: 'http://127.0.0.1:3900/v1',
    badge: 'Recommended',
    what: 'An easy installer with a window of its own. Clones a voice from a few seconds of audio, designs new voices from a description, many languages.',
    needs: ['Windows 10 / 11 (also macOS, Linux)', 'About 10 GB free disk — the app plus its voice models', 'An NVIDIA graphics card makes it fast; without one it runs on the processor, slower'],
    download: 'https://github.com/debpalash/VoiceStudio/releases/latest',
    file: 'On Windows, download the file ending in “-win-x64.exe” and run it.',
  },
  {
    id: 'qwentts',
    name: 'qwentts.cpp',
    url: 'http://127.0.0.1:8080/v1',
    badge: 'Lightweight',
    what: 'A small speech server for Qwen3-TTS voices with cloning. Fits graphics cards with 2–4 GB of memory.',
    needs: ['Windows with an NVIDIA graphics card', 'About 0.5–0.7 GB download plus a voice-model file', 'You start its speech server (tts-server) yourself — see its page'],
    download: 'https://github.com/Panda-Panta/qwentts.cpp/releases/latest',
    file: 'Download the .zip, unpack it and follow the steps on its page to start tts-server.',
  },
] as const;

function LocalVoiceGuide({ onClose }: { onClose: () => void }) {
  const s = useAiSettings();
  const lv = s.localVoice;
  const { status, message, check } = useLocalVoice();
  const [showAddress, setShowAddress] = useState(false);
  const chosen = LOCAL_APPS.find((a) => a.url === lv.url);
  const setUrl = (url: string) => updateAiSettings({ localVoice: { ...getAiSettings().localVoice, url, voices: [] } });
  const voiceCount = lv.voices.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-voice-title"
        className="flex max-h-[90vh] w-[560px] max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-4">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-weak text-accent">
            <HardDrive size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="local-voice-title" className="text-[15px] font-semibold leading-snug text-t1">Offline voice — set up once</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-t2">
              Realistic and cloned voices made on your own computer. A free voice app does the speaking and
              DrawFlow sends it the text: nothing goes to the internet, no API key, no cost per word.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          {status === 'connected' ? (
            <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-weak/50 px-3 py-2 text-[12.5px] text-t1">
              <Check size={15} className="shrink-0 text-accent" />
              Connected to {chosen?.name ?? 'your voice app'}{voiceCount ? ` — ${voiceCount} voice${voiceCount === 1 ? '' : 's'} ready` : ''}. You can generate offline voice now.
            </div>
          ) : status === 'checking' ? (
            <div className="flex items-center gap-2 rounded-xl bg-panel2 px-3 py-2 text-[12.5px] text-t2">
              <Loader2 size={14} className="shrink-0 animate-spin" /> Looking for a voice app on this computer…
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
              {status === 'error' && message
                ? <>The voice app answered, but: {message}. Check that a voice model is installed and loaded in it.</>
                : <>No voice app is running on this computer yet. Follow the three steps below — it takes a few minutes, once.</>}
            </div>
          )}

          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-t3">1 · Download one voice app (free)</div>
          <div className="grid grid-cols-2 gap-2">
            {LOCAL_APPS.map((app) => {
              const active = chosen?.id === app.id;
              return (
                <div key={app.id} className={'flex flex-col gap-1.5 rounded-xl border p-3 ' + (active ? 'border-accent bg-accent-weak/30' : 'border-line')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-t1">{app.name}</span>
                    <span className="rounded-full bg-panel2 px-1.5 py-0.5 text-[10px] text-t2">{app.badge}</span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-t2">{app.what}</p>
                  <ul className="flex list-disc flex-col gap-0.5 pl-4 text-[11px] leading-snug text-t3">
                    {app.needs.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                  <p className="text-[11px] leading-snug text-t3">{app.file}</p>
                  <div className="mt-auto flex flex-col gap-1.5 pt-1">
                    <a
                      href={app.download}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-white hover:opacity-90"
                      onClick={() => { if (!active) setUrl(app.url); }}
                    >
                      <Download size={13} /> Download {app.name}
                    </a>
                    <label className="flex items-center justify-center gap-1.5 text-[11px] text-t2">
                      <input type="radio" name="localApp" className="accent-[#0d9d97]" checked={active} onChange={() => setUrl(app.url)} />
                      I use this one
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-t3">2 · Install it and open it</div>
          <p className="text-[12px] leading-relaxed text-t2">
            The first start downloads its voice model, which can take a few minutes. Wait until the app says it is
            ready. To use your own voice, clone it there — it then shows up in DrawFlow's voice list.
          </p>

          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-t3">3 · Keep it open and press “Check again”</div>
          <p className="text-[12px] leading-relaxed text-t2">
            DrawFlow finds it on this computer, loads its voices and adds <b>Offline</b> voice to the Voice panel and to
            script narration. The app must be running whenever you generate a voice.
          </p>

          {!window.drawflow && (
            <p className="rounded-xl bg-panel2 px-3 py-2 text-[11.5px] leading-relaxed text-t2">
              You are using DrawFlow in a web browser. Browsers only let a page talk to an app on your computer if that
              app allows it (CORS). The DrawFlow desktop app needs no such setup.
            </p>
          )}

          <button type="button" className="self-start text-[11.5px] text-t3 underline-offset-2 hover:text-accent hover:underline" onClick={() => setShowAddress((v) => !v)}>
            {showAddress ? 'Hide address' : 'The app uses a different address?'}
          </button>
          {showAddress && (
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11.5px] text-t2">Address</span>
              <input type="text" className="df-input" placeholder="http://127.0.0.1:3900/v1" value={lv.url}
                onChange={(e) => updateAiSettings({ localVoice: { ...getAiSettings().localVoice, url: e.target.value.trim() } })} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <a href={chosen?.download.replace(/\/releases\/latest$/, '') ?? LOCAL_APPS[0].download} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-t3 hover:text-accent">
            <ExternalLink size={12} /> {chosen?.name ?? 'VoiceStudio'} help page
          </a>
          <div className="flex gap-2">
            {status === 'connected' ? (
              <Button variant="primary" onClick={onClose} autoFocus>Start using it</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button variant="primary" onClick={() => void check()} disabled={status === 'checking' || !lv.url}>
                  {status === 'checking' ? 'Checking…' : 'Check again'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mount once; shows the setup popup whenever `useLocalVoice().openGuide()` is called. */
export function LocalVoiceGuideHost() {
  const open = useLocalVoice((st) => st.guideOpen);
  const close = useLocalVoice((st) => st.closeGuide);
  return open ? <LocalVoiceGuide onClose={close} /> : null;
}
