import { Fragment, useState } from 'react';
import { explainAiError } from '../../lib/ai/errors';
import { Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import {
  HAS_FREE_TIER, KEY_HELP, PROVIDER_LABELS, getAiSettings, imageReady, textReady, updateAiSettings, useAiSettings,
  type ImageProvider, type Plan, type TextProvider,
} from '../../lib/ai/settings';
import { bareModel, isFreeTierModel, isGeminiImageModel, listModels, probeModel, rankForPlan, type ModelInfo } from '../../lib/ai/providers';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const PROVIDERS: TextProvider[] = ['groq', 'gemini', 'anthropic', 'openai'];
const useAiSettingsSnapshot = () => getAiSettings();

function ProviderRow({ id }: { id: TextProvider }) {
  const s = useAiSettings();
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [busy, setBusy] = useState<false | 'list' | 'check'>(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null); // model id that answered
  const key = s.keys[id];
  const model = s.textModel[id];
  const active = s.textProvider === id;
  const plan = s.plan[id];
  const setPlan = (p: Plan) => updateAiSettings({ plan: { ...s.plan, [id]: p } });
  // on a free key only free-tier models are offered
  const visible = models ? (plan === 'free' ? models.filter((m) => isFreeTierModel(id, m.id)) : models) : null;

  /** Ask the model to answer once; on failure walk down the ranked list until one does. */
  const verify = async (list: ModelInfo[], first: string) => {
    setBusy('check');
    setError(null);
    const ranked = rankForPlan(id, list.map((m) => m.id), plan);
    const candidates = [first, ...ranked.filter((m) => m !== first)].slice(0, 5);
    let lastErr: unknown = null;
    for (const cand of candidates) {
      try {
        await probeModel(id, key, cand);
        updateAiSettings({ textModel: { ...useAiSettingsSnapshot().textModel, [id]: cand } });
        setVerified(cand);
        setBusy(false);
        if (cand !== first) setError(null);
        return;
      } catch (e) {
        lastErr = e;
        const why = explainAiError(e, id, 'text');
        // a bad key or no credit won't get better with another model
        if (why.kind === 'key' || why.kind === 'credit' || why.kind === 'network') break;
      }
    }
    setVerified(null);
    const why = explainAiError(lastErr, id, 'text');
    setError(`${why.title}. ${why.steps[0] ?? ''}`);
    setBusy(false);
  };

  const fetchModels = async () => {
    setBusy('list');
    setError(null);
    setVerified(null);
    try {
      const list = await listModels(id, key);
      setModels(list);
      const ranked = rankForPlan(id, list.map((m) => m.id), plan);
      const keep = model && ranked.includes(bareModel(model)) ? bareModel(model) : ranked[0] ?? '';
      if (!keep) { setError(plan === 'free' ? 'None of the listed models is on the free tier — switch Plan to Paid.' : 'The provider listed no chat models for this key.'); setBusy(false); return; }
      if (id === 'gemini') {
        const img = pickImageModel(list);
        if (img && !s.imageModel.gemini) updateAiSettings({ imageModel: { ...s.imageModel, gemini: img } });
      }
      await verify(list, keep);
    } catch (e) {
      // inside the settings dialog the explanation goes inline (the dialog is already the place to fix it)
      const why = explainAiError(e, id);
      setError(`${why.title}. ${why.steps[0] ?? ''}`);
      setBusy(false);
    }
  };

  const choose = (next: string) => {
    updateAiSettings({ textModel: { ...s.textModel, [id]: next } });
    setVerified(null);
    if (models && next) void verify(models, next);
  };

  return (
    <div className={'rounded-xl border p-3 ' + (active ? 'border-accent bg-accent-weak/40' : 'border-line')}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[13px] font-medium">
          <input type="radio" name="textProvider" className="accent-[#0d9d97]" checked={active} onChange={() => updateAiSettings({ textProvider: id })} />
          {PROVIDER_LABELS[id]}
        </label>
        <span className="text-[10.5px] text-t3">{KEY_HELP[id]}</span>
      </div>
      {HAS_FREE_TIER[id] && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11.5px] text-t2">Plan</span>
          <Segmented<Plan> className="w-[200px]" value={plan} onChange={(p) => { setPlan(p); setVerified(null); }} options={[{ value: 'free', label: 'Free tier' }, { value: 'paid', label: 'Paid' }]} />
          <span className="text-[10.5px] text-t3">{plan === 'free' ? 'only models with free quota are offered' : 'every model the key can reach'}</span>
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <input
          type={show ? 'text' : 'password'}
          className="df-input"
          placeholder="API key"
          value={key}
          autoComplete="off"
          onChange={(e) => updateAiSettings({ keys: { ...s.keys, [id]: e.target.value.trim() } })}
        />
        <IconButton label={show ? 'Hide key' : 'Show key'} onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
        <Button variant="secondary" onClick={() => void fetchModels()} disabled={!key || !!busy} title="Fetch the model list, pick the best one for your plan and check that it answers">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy === 'check' ? 'Checking…' : 'Models'}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11.5px] text-t2">Model</span>
        {visible ? (
          <select className="df-input" value={bareModel(model)} onChange={(e) => choose(e.target.value)}>
            <option value="">— choose —</option>
            {visible.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            {model && !visible.some((m) => m.id === bareModel(model)) && <option value={bareModel(model)}>{bareModel(model)} (not on this plan)</option>}
          </select>
        ) : (
          <input
            type="text"
            className="df-input"
            placeholder="press Models, or type a model id"
            value={model}
            onChange={(e) => updateAiSettings({ textModel: { ...s.textModel, [id]: bareModel(e.target.value) } })}
          />
        )}
      </div>
      {verified && verified === bareModel(model) && !error && (
        <div className="mt-1.5 text-[11.5px] text-accent">✓ {verified} answers with this key{visible && models && visible.length < models.length ? ` · ${models.length - visible.length} paid-only model${models.length - visible.length === 1 ? '' : 's'} hidden` : ''}</div>
      )}
      {id === 'gemini' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11.5px] text-t2">Images</span>
          {models ? (
            <select className="df-input" value={s.imageModel.gemini} onChange={(e) => updateAiSettings({ imageModel: { ...s.imageModel, gemini: e.target.value } })}>
              <option value="">— choose an image model —</option>
              {models.filter((m) => isGeminiImageModel(m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : (
            <input type="text" className="df-input" placeholder="e.g. gemini-2.5-flash-image" value={s.imageModel.gemini}
              onChange={(e) => updateAiSettings({ imageModel: { ...s.imageModel, gemini: e.target.value.trim() } })} />
          )}
        </div>
      )}
      {id === 'openai' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11.5px] text-t2">Images</span>
          <input type="text" className="df-input" placeholder="gpt-image-1" value={s.imageModel.openai}
            onChange={(e) => updateAiSettings({ imageModel: { ...s.imageModel, openai: e.target.value.trim() } })} />
        </div>
      )}
      {error && <div className="mt-1.5 text-[11.5px] text-red-500">{error}</div>}
    </div>
  );
}

/** Prefer a released image model; preview ones often have no free allowance. */
function pickImageModel(list: ModelInfo[]): string {
  const imgs = list.filter((m) => isGeminiImageModel(m.id));
  for (const re of [/^gemini-2\.5-flash-image$/, /flash-image$/, /image(?!.*preview)/, /image/]) {
    const hit = imgs.find((m) => re.test(m.id));
    if (hit) return hit.id;
  }
  return '';
}

const SHORT: Record<TextProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', groq: 'Groq', gemini: 'Gemini' };

/** Which provider each job goes to — the thing people most often get wrong. */
function WhoDoesWhat() {
  const s = useAiSettings();
  const voices = (['openai', 'groq', 'gemini'] as TextProvider[]).filter((p) => s.keys[p]).map((p) => SHORT[p]);
  const rows: [string, string, boolean][] = [
    ['Text, scripts, suggestions', textReady(s) ? `${SHORT[s.textProvider]} · ${s.textModel[s.textProvider]}` : `${SHORT[s.textProvider]} — add a key and pick a model`, textReady(s)],
    ['Pictures & cartoons', imageReady(s) ? `${SHORT[s.imageProvider]} · ${s.imageModel[s.imageProvider]}` : `${SHORT[s.imageProvider]} — needs a key and an image model`, imageReady(s)],
    ['AI voice & transcription', voices.length ? voices.join(', ') : 'add an OpenAI, Groq or Gemini key', voices.length > 0],
  ];
  return (
    <div className="rounded-xl bg-panel2 px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-t3">Who does what</div>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        {rows.map(([job, who, ok]) => (
          <Fragment key={job}>
            <span className="text-t2">{job}</span>
            <span className={ok ? 'text-t1' : 'text-amber-600'}>{who}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useAiSettings();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[88vh] w-[560px] flex-col rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="text-[15px] font-semibold">AI settings</span>
          <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] leading-relaxed text-t2">
            Keys are stored only in this browser and sent directly to the provider you pick. The radio button
            chooses who handles text; pictures have their own choice at the bottom. Press <b>Models</b> after
            pasting a key: the best model for your plan is chosen and checked with a one-word request.
          </p>
          <WhoDoesWhat />
          {PROVIDERS.map((id) => <ProviderRow key={id} id={id} />)}
          <div className="rounded-xl border border-line p-3">
            <div className="text-[13px] font-medium">Pictures (cartoons, generated images)</div>
            <div className="mt-2 flex gap-4">
              {(['gemini', 'openai'] as ImageProvider[]).map((p) => (
                <label key={p} className="flex items-center gap-2 text-[12.5px]">
                  <input type="radio" name="imageProvider" className="accent-[#0d9d97]" checked={s.imageProvider === p} onChange={() => updateAiSettings({ imageProvider: p })} />
                  {p === 'gemini' ? 'Gemini (free tier)' : 'OpenAI (paid)'}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-t3">Photo → doodle needs no key at all — it runs inside the app.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
