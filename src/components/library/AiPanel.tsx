import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Circle, Image as ImageIcon, Loader2, Play, RotateCcw, Settings, Sparkles, Square, Upload, Wand2 } from 'lucide-react';
import { useAiSettings, imageReady, textReady, PROVIDER_LABELS, type ImageProvider } from '../../lib/ai/settings';
import { plan, type Proposal } from '../../lib/ai/planner';
import { planScript, buildScript, narratePlan, releaseTakes, type NarrationTake, type ScriptPlan } from '../../lib/ai/script';
import { TTS_MODELS, type SpeechProvider } from '../../lib/ai/speech';
import { generateImage } from '../../lib/ai/providers';
import { sketchFromImage, type SketchResult } from '../../lib/sketch';
import { loadRasterImage, isRasterFile } from '../../lib/images';
import { addImageElement, addImportedSvg, addLibraryIllustration, addSketchElement, addTextSized } from '../../lib/addElements';
import { useGallery } from '../../lib/gallery';
import { AiSettingsDialog } from './AiSettingsDialog';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Segmented';
import { reportAiError } from '../../store/problemStore';
import { Slider } from '../ui/Slider';
import { Field } from '../ui/Field';

type Tab = 'create' | 'photo' | 'script';
type PhotoStyle = 'doodle' | 'cartoon';

function svgDataUrl(svg: string): string {
  // browsers need the namespace to render an SVG as an image; models often omit it
  const withNs = /<svg[^>]*xmlns=/.test(svg) ? svg : svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
}

function splitDataUrl(url: string): { mime: string; base64: string } {
  const m = url.match(/^data:([^;]+);base64,(.*)$/);
  return m ? { mime: m[1], base64: m[2] } : { mime: 'image/png', base64: '' };
}

const IMAGE_NAMES: Record<ImageProvider, string> = { gemini: 'Gemini', openai: 'OpenAI' };

const CARTOON_PROMPT =
  'Redraw this photo as a clean whiteboard-style cartoon illustration: bold black outlines, simple flat colours, ' +
  'no shading, no background (plain white), no text. Keep the subject recognisable and centred.';

// ---------------------------------------------------------------------------

function CreateTab({ onAdded }: { onAdded?: () => void }) {
  const s = useAiSettings();
  const ready = textReady(s);
  const canImage = imageReady(s);
  const [prompt, setPrompt] = useState('');
  const [asPicture, setAsPicture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [picture, setPicture] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProposals([]);
    setPicture(null);
    try {
      if (asPicture) {
        const img = await generateImage(s.imageProvider, s.keys[s.imageProvider], s.imageModel[s.imageProvider],
          `${prompt.trim()} — whiteboard illustration style, clean black outlines, flat colours, plain white background, no text`);
        setPicture(`data:${img.mime};base64,${img.base64}`);
      } else {
        setProposals(await plan(prompt.trim()));
      }
    } catch (e) {
      setError(reportAiError(e, asPicture ? s.imageProvider : s.textProvider, asPicture ? 'image' : 'text').title);
    } finally {
      setBusy(false);
    }
  };

  const addProposal = async (p: Proposal) => {
    if (p.kind === 'text') await addTextSized(p.text, p.size);
    else if (p.kind === 'svg') addImportedSvg(p.svg, p.label);
    else await addLibraryIllustration(p.options[picked[p.id] ?? 0]);
  };

  const addAll = async () => {
    for (const p of proposals) await addProposal(p);
    onAdded?.();
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="df-input min-h-[72px] resize-y"
        placeholder={asPicture ? 'Describe the picture to generate…' : 'What should go on the board? e.g. "a lightbulb with a plant growing out of it", or "a 3-part scene about saving money"'}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(); }}
      />
      <label className="flex items-center gap-2 text-[12px] text-t2">
        <input type="checkbox" className="accent-[#0d9d97]" checked={asPicture} onChange={(e) => setAsPicture(e.target.checked)} />
        Generate a picture instead
      </label>
      {asPicture && (
        <p className="-mt-1.5 pl-6 text-[10.5px] text-t3">
          {imageReady(s) ? `Pictures via ${IMAGE_NAMES[s.imageProvider]} · ${s.imageModel[s.imageProvider]} (set under “Pictures” in AI settings)` : 'Pictures need a Gemini or OpenAI key with an image model — see “Pictures” in AI settings'}
        </p>
      )}
      <Button variant="primary" className="justify-center" onClick={() => void run()} disabled={busy || !prompt.trim() || (asPicture ? !canImage : !ready)}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {busy ? 'Thinking…' : asPicture ? 'Generate picture' : 'Create elements'}
      </Button>
      {!ready && !asPicture && (
        <p className="text-[11.5px] text-t3">Add an API key and pick a model in AI settings (gear above) — Groq and Gemini have free tiers.</p>
      )}
      {asPicture && !canImage && (
        <p className="text-[11.5px] text-t3">Pictures need a Gemini or OpenAI key with an image model — set it in AI settings.</p>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[12px] text-red-600">{error}</div>}

      {picture && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-2">
          <img src={picture} alt="" className="max-h-56 w-full rounded-lg bg-white object-contain" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="justify-center" onClick={async () => {
              const img = await loadRasterImage(await (await fetch(picture)).blob());
              addImageElement(img, prompt.slice(0, 24)); onAdded?.();
            }}>Add as picture</Button>
            <Button variant="secondary" className="justify-center" onClick={async () => {
              const sk = await sketchFromImage(picture, { detail: 1.0, lines: 0.45 });
              addSketchElement(sk, prompt.slice(0, 24)); onAdded?.();
            }}>Make it drawable</Button>
          </div>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Suggested elements</span>
            <Button variant="secondary" onClick={() => void addAll()}>Add all</Button>
          </div>
          {proposals.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel2 p-2">
              <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                {p.kind === 'text' && (
                  <span className="px-1 text-center text-[12px] leading-tight" style={{ fontFamily: 'Caveat, cursive', fontSize: p.size === 'title' ? 18 : p.size === 'small' ? 12 : 15 }}>{p.text}</span>
                )}
                {p.kind === 'svg' && <img src={svgDataUrl(p.svg)} alt="" className="h-12 w-12 object-contain" />}
                {p.kind === 'library' && <img src={p.options[picked[p.id] ?? 0].src} alt="" className="h-12 w-12 object-contain" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{p.kind === 'text' ? 'Text' : p.label}</div>
                <div className="text-[10.5px] text-t3">
                  {p.kind === 'text' ? `${p.size} text` : p.kind === 'svg' ? 'drawn by the model' : `from the library · ${p.options.length} match${p.options.length > 1 ? 'es' : ''}`}
                </div>
                {p.kind === 'library' && p.options.length > 1 && (
                  <div className="mt-1 flex gap-1">
                    {p.options.map((o, i) => (
                      <button key={o.id} type="button" title={o.name}
                        className={'h-7 w-7 rounded-md border bg-white p-0.5 ' + ((picked[p.id] ?? 0) === i ? 'border-accent' : 'border-line')}
                        onClick={() => setPicked((m) => ({ ...m, [p.id]: i }))}>
                        <img src={o.src} alt="" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="secondary" onClick={() => void addProposal(p)}>Add</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PhotoTab({ onAdded }: { onAdded?: () => void }) {
  const s = useAiSettings();
  const gallery = useGallery();
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState('Photo');
  const [style, setStyle] = useState<PhotoStyle>('doodle');
  const [detail, setDetail] = useState(1.0);
  const [lines, setLines] = useState(0.4);
  const [sketch, setSketch] = useState<SketchResult | null>(null);
  const [cartoon, setCartoon] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!isRasterFile(file)) { setError('Choose a PNG, JPG or WebP photo.'); return; }
    setError(null);
    const img = await loadRasterImage(file);
    setSrc(img.src);
    setName(file.name.replace(/\.[^.]+$/, ''));
    setCartoon(null);
  };

  // live doodle preview (debounced)
  useEffect(() => {
    if (!src || style !== 'doodle') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      try { setSketch(await sketchFromImage(src, { detail, lines })); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not sketch this photo.'); }
      finally { setBusy(false); }
    }, 150);
    return () => window.clearTimeout(timer.current);
  }, [src, style, detail, lines]);

  const makeCartoon = async () => {
    if (!src) return;
    setBusy(true);
    setError(null);
    try {
      const img = await generateImage(s.imageProvider, s.keys[s.imageProvider], s.imageModel[s.imageProvider], CARTOON_PROMPT, splitDataUrl(src));
      setCartoon(`data:${img.mime};base64,${img.base64}`);
    } catch (e) {
      setError(reportAiError(e, s.imageProvider, 'image').title);
    } finally {
      setBusy(false);
    }
  };

  const previewSvg = sketch
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sketch.width} ${sketch.height}"><rect width="100%" height="100%" fill="#fff"/>` +
      sketch.paths.map((d) => `<path d="${d}" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('') + '</svg>'
    : null;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[12.5px] text-t3 hover:border-accent hover:text-accent">
        <Upload size={15} />
        {src ? 'Choose a different photo' : 'Choose a photo (PNG, JPG, WebP)'}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {gallery.items.filter((g) => g.kind === 'image').length > 0 && !src && (
        <div className="flex gap-1.5 overflow-x-auto">
          {gallery.items.filter((g) => g.kind === 'image').map((g) => (
            <button key={g.id} type="button" title={g.name} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-white hover:border-accent"
              onClick={() => { setSrc(g.data); setName(g.name); setCartoon(null); }}>
              <img src={g.data} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {src && (
        <>
          <Segmented<PhotoStyle>
            value={style}
            onChange={setStyle}
            options={[{ value: 'doodle', label: 'Doodle (offline)' }, { value: 'cartoon', label: 'Cartoon (AI)' }]}
          />
          <div className="grid grid-cols-2 gap-2">
            <img src={src} alt="" className="h-28 w-full rounded-lg border border-line bg-white object-contain" />
            <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
              {style === 'doodle' && previewSvg && <img src={svgDataUrl(previewSvg)} alt="" className="h-full w-full object-contain" />}
              {style === 'cartoon' && cartoon && <img src={cartoon} alt="" className="h-full w-full object-contain" />}
              {style === 'cartoon' && !cartoon && !busy && <span className="px-2 text-center text-[11px] text-t3">Press "Make cartoon"</span>}
              {busy && <Loader2 size={18} className="absolute animate-spin text-accent" />}
            </div>
          </div>

          {style === 'doodle' ? (
            <>
              <Field label="Detail">
                <Slider value={detail} onChange={setDetail} min={0.5} max={2.5} step={0.05} precision={2} />
              </Field>
              <Field label="Lines">
                <Slider value={lines} onChange={setLines} min={0} max={1} step={0.02} precision={2} />
              </Field>
              {sketch && <p className="tabular text-[11px] text-t3">{sketch.strokeCount} strokes · runs in the app, no key needed</p>}
              <Button variant="primary" className="justify-center" disabled={!sketch || busy} onClick={() => { if (sketch) { addSketchElement(sketch, name); onAdded?.(); } }}>
                <Wand2 size={14} /> Add doodle to canvas
              </Button>
            </>
          ) : (
            <>
              {!imageReady(s) && <p className="text-[11.5px] text-t3">Cartoons need a Gemini or OpenAI key with an image model — set it in AI settings (gear above).</p>}
              <Button variant="primary" className="justify-center" disabled={busy || !imageReady(s)} onClick={() => void makeCartoon()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {cartoon ? 'Make another' : 'Make cartoon'}
              </Button>
              {cartoon && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="justify-center" onClick={async () => {
                    const img = await loadRasterImage(await (await fetch(cartoon)).blob());
                    addImageElement(img, `${name} (cartoon)`); onAdded?.();
                  }}><ImageIcon size={13} /> Add as picture</Button>
                  <Button variant="secondary" className="justify-center" onClick={async () => {
                    const sk = await sketchFromImage(cartoon, { detail: 1.0, lines: 0.45 });
                    addSketchElement(sk, `${name} (cartoon)`); onAdded?.();
                  }}><Wand2 size={13} /> Make it drawable</Button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Script → scribe: scenes, pictures, text, narration and timing from a script or topic. */
type ScriptStage = 'idle' | 'planning' | 'narrating' | 'ready' | 'adding';

/** Step list with a progress bar — what is happening right now. */
function Progress({ steps, active, detail, fraction }: { steps: string[]; active: number; detail?: string; fraction?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-3">
      <ol className="flex flex-col gap-1.5">
        {steps.map((label, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'todo';
          return (
            <li key={label} className={'flex items-start gap-2 text-[12.5px] ' + (state === 'todo' ? 'text-t3' : state === 'done' ? 'text-t2' : 'font-medium text-t1')}>
              <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {state === 'done' ? <Check size={13} className="text-accent" /> : state === 'active' ? <Loader2 size={13} className="animate-spin text-accent" /> : <Circle size={9} className="text-t3" />}
              </span>
              <span className="min-w-0 flex-1">
                {label}
                {state === 'active' && detail && <span className="mt-0.5 block truncate text-[11px] font-normal text-t2">{detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
        {fraction === undefined
          ? <div className="df-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent" />
          : <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(fraction * 100)}%` }} />}
      </div>
    </div>
  );
}

/** Play/stop one spoken take. */
function TakePlayer({ take }: { take: NarrationTake }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { ref.current?.pause(); }, []);
  const toggle = () => {
    if (!ref.current) {
      ref.current = new Audio(take.url);
      ref.current.onended = () => setPlaying(false);
    }
    if (playing) {
      ref.current.pause();
      ref.current.currentTime = 0;
      setPlaying(false);
    } else {
      void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };
  return (
    <button
      type="button"
      className={'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] tabular ' + (playing ? 'border-accent bg-accent-weak text-accent' : 'border-line bg-panel text-t2 hover:text-t1')}
      onClick={toggle}
      title={playing ? 'Stop' : 'Listen to this scene\'s narration'}
    >
      {playing ? <Square size={10} /> : <Play size={10} />}
      {take.duration.toFixed(1)} s
    </button>
  );
}

function ScriptTab({ onAdded }: { onAdded?: () => void }) {
  const s = useAiSettings();
  const ready = textReady(s);
  const speech = (['openai', 'groq', 'gemini'] as SpeechProvider[]).filter((p) => s.keys[p]);
  const [prompt, setPrompt] = useState('');
  const [narrate, setNarrate] = useState(speech.length > 0);
  // the chosen provider only counts while it has a key — otherwise the first provider that does
  // (keys can be added after this panel mounted, so this is derived, not frozen in state)
  const [chosenProvider, setProvider] = useState<SpeechProvider | null>(null);
  const provider: SpeechProvider = chosenProvider && speech.includes(chosenProvider) ? chosenProvider : (speech[0] ?? 'openai');
  const [chosenVoice, setVoice] = useState<string | null>(null);
  const voice = chosenVoice && TTS_MODELS[provider].voices.some((v) => v.id === chosenVoice) ? chosenVoice : TTS_MODELS[provider].voices[0].id;
  const [stage, setStage] = useState<ScriptStage>('idle');
  const [detail, setDetail] = useState<string | undefined>();
  const [fraction, setFraction] = useState<number | undefined>();
  const [plan, setPlan] = useState<ScriptPlan | null>(null);
  const [takes, setTakes] = useState<NarrationTake[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const willNarrate = narrate && speech.length > 0;
  const busy = stage === 'planning' || stage === 'narrating' || stage === 'adding';

  // object URLs die with the component
  useEffect(() => () => releaseTakes(takes), [takes]);

  const reset = () => {
    releaseTakes(takes);
    setTakes([]);
    setPlan(null);
    setWarning(null);
    setDetail(undefined);
    setFraction(undefined);
    setStage('idle');
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    reset();
    setStage('planning');
    let planned: ScriptPlan;
    try {
      planned = await planScript(prompt.trim());
      setPlan(planned);
    } catch (e) {
      reportAiError(e, s.textProvider, 'text');
      setStage('idle');
      return;
    }
    if (willNarrate) {
      setStage('narrating');
      setFraction(0);
      try {
        const { takes: spoken, failed } = await narratePlan(planned, {
          provider, voice,
          onProgress: (msg, i, n) => { setDetail(msg); setFraction(n ? i / n : undefined); },
        });
        setTakes(spoken);
        if (failed.length) setWarning(`Narration could not be made for scene${failed.length > 1 ? 's' : ''} ${failed.map((f) => f.scene + 1).join(', ')} — those scenes will be timed without a voice.`);
      } catch (e) {
        reportAiError(e, provider, 'voice');
        setWarning('The narration could not be generated — you can still add the scenes without a voice, or try again.');
      }
    }
    setDetail(undefined);
    setFraction(undefined);
    setStage('ready');
  };

  const add = async () => {
    if (!plan || busy) return;
    setStage('adding');
    setDetail(undefined);
    try {
      await buildScript(plan, { narration: takes, onProgress: setDetail });
      reset();
      onAdded?.();
    } catch (e) {
      reportAiError(e, s.textProvider, 'text');
      setStage('ready');
    }
  };

  const steps = willNarrate ? ['Planning the scenes', 'Generating the narration audio', 'Ready to add'] : ['Planning the scenes', 'Ready to add'];
  const activeStep = stage === 'planning' ? 0 : stage === 'narrating' ? 1 : steps.length - 1;
  const totalSpoken = takes.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div className="flex flex-col gap-3">
      {stage === 'idle' ? (
        <>
          <Field label="Your script, or just a topic">
            <textarea
              className="df-input min-h-[110px] resize-y"
              placeholder={'e.g. "Explain how a bill becomes law in 4 scenes" — or paste the narration you already wrote.'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>
          {speech.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-2.5">
              <label className="flex items-center gap-2 text-[12px] text-t1">
                <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
                Add narration — an AI voice speaks each scene and the drawing is timed to it
              </label>
              {narrate && (
                <div className="grid grid-cols-2 gap-2">
                  <select className="df-input !h-7 text-[12px]" value={provider} onChange={(e) => { const p = e.target.value as SpeechProvider; setProvider(p); setVoice(TTS_MODELS[p].voices[0].id); }}>
                    {speech.map((p) => <option key={p} value={p}>{p === 'openai' ? 'OpenAI' : p === 'groq' ? 'Groq (PlayAI)' : 'Gemini'}</option>)}
                  </select>
                  <select className="df-input !h-7 text-[12px]" value={voice} onChange={(e) => setVoice(e.target.value)}>
                    {TTS_MODELS[provider].voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        // while working / reviewing, the request shrinks to a summary so the progress and result stay in view
        <div className="rounded-xl border border-line bg-panel2 px-3 py-2">
          <div className="line-clamp-2 text-[12px] leading-snug text-t1">“{prompt.trim()}”</div>
          <div className="mt-1 text-[10.5px] text-t3">
            {willNarrate ? `Narration: ${provider === 'openai' ? 'OpenAI' : provider === 'groq' ? 'Groq' : 'Gemini'} · ${TTS_MODELS[provider].voices.find((v) => v.id === voice)?.label ?? voice}` : 'No narration'}
          </div>
        </div>
      )}

      {(stage === 'idle') && (
        <Button variant="primary" className="justify-center" disabled={!ready || !prompt.trim()} onClick={() => void generate()}>
          <Sparkles size={14} /> {willNarrate ? 'Generate scenes & narration' : 'Generate scenes'}
        </Button>
      )}
      {!ready && stage === 'idle' && <p className="text-[11.5px] text-t3">Add an API key in the settings (gear) to use this.</p>}

      {(stage === 'planning' || stage === 'narrating') && (
        <Progress steps={steps} active={activeStep} detail={detail} fraction={stage === 'narrating' ? fraction : undefined} />
      )}

      {plan && (stage === 'ready' || stage === 'adding') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-[12.5px] font-semibold text-t1">{plan.title}</div>
            <span className="text-[10.5px] text-t3">
              {plan.scenes.length} scenes{takes.length ? ` · ${totalSpoken.toFixed(0)} s of narration` : ''}
            </span>
          </div>
          {warning && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11.5px] text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {warning}
            </div>
          )}
          {stage === 'adding' ? (
            <Progress steps={['Building the scenes on the canvas']} active={0} detail={detail} />
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button variant="primary" className="justify-center" onClick={() => void add()}>
                <Wand2 size={14} /> Add to canvas
              </Button>
              <Button variant="secondary" onClick={reset} title="Discard this plan and start again">
                <RotateCcw size={13} /> Start over
              </Button>
            </div>
          )}
          {plan.scenes.map((sc, i) => {
            const take = takes.find((t) => t.scene === i);
            return (
              <div key={i} className="rounded-xl border border-line p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[12px] font-medium text-t1">{i + 1}. {sc.name}</div>
                  {take && <TakePlayer take={take} />}
                </div>
                {sc.narration && <div className="mt-0.5 text-[11.5px] text-t2">“{sc.narration}”</div>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {sc.items.map((it, k) => (
                    <span key={k} className="rounded-full bg-panel2 px-2 py-0.5 text-[10.5px] text-t2">
                      {it.type === 'text' ? `“${it.text}”` : it.type === 'library' ? `🖼 ${it.label}` : `✏ ${it.label}`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] leading-relaxed text-t3">
            Scenes are appended to the current project with fade transitions{takes.length ? ', the narration goes on the Voice lane' : ''}; everything stays editable. Undo removes it all.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AiPanel({ onAdded }: { onAdded?: () => void }) {
  const s = useAiSettings();
  const [tab, setTab] = useState<Tab>('create');
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Segmented<Tab>
          className="flex-1"
          data-tour="ai-tabs"
          value={tab}
          onChange={setTab}
          options={[{ value: 'create', label: 'Create' }, { value: 'script', label: 'Script' }, { value: 'photo', label: 'Photo' }]}
        />
        <IconButton label="AI settings (API keys, models)" onClick={() => setShowSettings(true)} data-tour="ai-settings">
          <Settings size={15} />
        </IconButton>
      </div>
      <div className="text-[10.5px] text-t3">
        {tab === 'photo'
          ? (imageReady(s) ? `Cartoons via ${IMAGE_NAMES[s.imageProvider]} · ${s.imageModel[s.imageProvider]} — doodles need no key` : 'Doodles work offline — cartoons need a Gemini or OpenAI key')
          : textReady(s) ? `Text via ${PROVIDER_LABELS[s.textProvider].split(' ')[0]} · ${s.textModel[s.textProvider]}` : 'No AI key set — photo → doodle still works offline'}
      </div>
      {tab === 'create' ? <CreateTab onAdded={onAdded} /> : tab === 'script' ? <ScriptTab onAdded={onAdded} /> : <PhotoTab onAdded={onAdded} />}
      {showSettings && <AiSettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
