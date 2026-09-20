import { useState } from 'react';
import { explainAiError } from '../../lib/ai/errors';
import { Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import {
  KEY_HELP, PROVIDER_LABELS, updateAiSettings, useAiSettings,
  type ImageProvider, type TextProvider,
} from '../../lib/ai/settings';
import { isGeminiImageModel, listModels, type ModelInfo } from '../../lib/ai/providers';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const PROVIDERS: TextProvider[] = ['groq', 'gemini', 'anthropic', 'openai'];

function ProviderRow({ id }: { id: TextProvider }) {
  const s = useAiSettings();
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = s.keys[id];
  const model = s.textModel[id];
  const active = s.textProvider === id;

  const fetchModels = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await listModels(id, key);
      setModels(list);
      if (!model && list.length) updateAiSettings({ textModel: { ...s.textModel, [id]: pickDefault(id, list) } });
      if (id === 'gemini') {
        const img = list.find((m) => isGeminiImageModel(m.id));
        if (img && !s.imageModel.gemini) updateAiSettings({ imageModel: { ...s.imageModel, gemini: img.id } });
      }
    } catch (e) {
      // inside the settings dialog the explanation goes inline (the dialog is already the place to fix it)
      const why = explainAiError(e, id);
      setError(`${why.title}. ${why.steps[0] ?? ''}`);
    } finally {
      setBusy(false);
    }
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
        <Button variant="secondary" onClick={() => void fetchModels()} disabled={!key || busy} title="Ask the provider for its current model list">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Models
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11.5px] text-t2">Model</span>
        {models ? (
          <select className="df-input" value={model} onChange={(e) => updateAiSettings({ textModel: { ...s.textModel, [id]: e.target.value } })}>
            <option value="">— choose —</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        ) : (
          <input
            type="text"
            className="df-input"
            placeholder="load the list, or type a model id"
            value={model}
            onChange={(e) => updateAiSettings({ textModel: { ...s.textModel, [id]: e.target.value.trim() } })}
          />
        )}
      </div>
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

function pickDefault(id: TextProvider, list: ModelInfo[]): string {
  const prefer: Record<TextProvider, RegExp[]> = {
    groq: [/llama-3\.3-70b/, /llama-4.*scout/, /gpt-oss-120b/, /llama/],
    gemini: [/gemini-2\.5-flash$/, /gemini-2\.5-flash-lite/, /gemini-2\.0-flash$/, /flash/],
    anthropic: [/sonnet/, /haiku/, /opus/],
    openai: [/^gpt-4\.1$/, /^gpt-4o$/, /^gpt-5/, /^gpt-4/],
  };
  for (const re of prefer[id]) {
    const hit = list.find((m) => re.test(m.id));
    if (hit) return hit.id;
  }
  return list[0]?.id ?? '';
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
            Keys are stored only in this browser and sent directly to the provider you pick. Choose which
            provider understands your requests (radio button); pictures come from Gemini or OpenAI.
          </p>
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
