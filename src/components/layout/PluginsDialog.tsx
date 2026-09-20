import { useState } from 'react';
import { Puzzle, RefreshCw, Trash2, X } from 'lucide-react';
import { activatePlugin, installPlugin, removePlugin, setPluginEnabled, usePlugins } from '../../lib/plugins';
import { api } from '../../lib/api';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

const EXAMPLE = `export default {
  id: 'example.wobble',
  name: 'Wobble effects',
  setup(api) {
    // an emphasis effect: the element wobbles side to side
    api.plugins.registerEffect({
      kind: 'emphasis', id: 'wobble', label: 'Wobble',
      frame: ({ p, base }) => ({ rotate: base.rotate + Math.sin(p * Math.PI * 4) * 6 }),
    });
    // an exporter: log the file size after every export
    api.plugins.registerExporter({
      id: 'log-size', label: 'Log size',
      run: (result) => console.log(result.filename, result.sizeBytes),
    });
  },
};`;

export function PluginsDialog({ onClose }: { onClose: () => void }) {
  const { installed, effects, assetProviders, exporters, panels } = usePlugins();
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (source: { url: string } | { code: string }) => {
    setBusy(true);
    setError(null);
    try {
      await installPlugin(source, api);
      setUrl('');
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div className="flex max-h-[86vh] w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="flex items-center gap-2 text-[15px] font-semibold"><Puzzle size={16} className="text-accent" /> Plugins</span>
          <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-medium tracking-wide text-t3 uppercase">Installed</div>
            {installed.length === 0 && <p className="text-[12px] text-t3">No plugins yet.</p>}
            {installed.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-xl border border-line p-2.5">
                <input type="checkbox" className="mt-1" checked={p.enabled} onChange={(e) => setPluginEnabled(p.id, e.target.checked)} title="Enabled" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-t1">{p.name}</div>
                  <div className="truncate text-[10.5px] text-t3">{p.id} · {'url' in p.source ? p.source.url : 'inline code'}</div>
                  {p.error && <div className="mt-1 text-[11px] text-red-500">{p.error}</div>}
                </div>
                <IconButton label="Reload" className="!h-7 !w-7" onClick={() => void activatePlugin(p, api)}><RefreshCw size={12} /></IconButton>
                <IconButton label="Remove" className="!h-7 !w-7 hover:!bg-red-50 hover:!text-red-500" onClick={() => removePlugin(p.id)}><Trash2 size={12} /></IconButton>
              </div>
            ))}
            <div className="text-[11px] font-medium tracking-wide text-t3 uppercase">Registered</div>
            <div className="text-[11.5px] leading-relaxed text-t2">
              {effects.length} effect{effects.length === 1 ? '' : 's'} · {assetProviders.length} asset provider{assetProviders.length === 1 ? '' : 's'} · {exporters.length} exporter{exporters.length === 1 ? '' : 's'} · {panels.length} panel{panels.length === 1 ? '' : 's'}
              {effects.length > 0 && <div className="mt-1 text-t3">Effects: {effects.map((e) => `${e.label} (${e.kind})`).join(', ')}</div>}
            </div>
            <p className="text-[11px] leading-relaxed text-t3">
              Plugins run with full access to this page. Only install code you trust. Removing a plugin takes full effect after a reload.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Add from a URL (ES module)">
              <div className="flex gap-1.5">
                <input className="df-input" placeholder="https://…/my-plugin.js" value={url} onChange={(e) => setUrl(e.target.value)} />
                <Button variant="secondary" disabled={!url.trim() || busy} onClick={() => void add({ url: url.trim() })}>Add</Button>
              </div>
            </Field>
            <Field label="Or paste plugin code">
              <textarea className="df-input min-h-[200px] resize-y font-mono text-[11.5px]" value={code} onChange={(e) => setCode(e.target.value)} placeholder={EXAMPLE} spellCheck={false} />
            </Field>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={!code.trim() || busy} onClick={() => void add({ code })}>Install pasted code</Button>
              <Button onClick={() => setCode(EXAMPLE)}>Use the example</Button>
            </div>
            {error && <div className="text-[11.5px] whitespace-pre-wrap text-red-500">{error}</div>}
            <p className="text-[11px] leading-relaxed text-t3">
              A plugin default-exports <code>{'{ id, name, setup(api) }'}</code>. In <code>setup</code>, call
              <code> api.plugins.registerEffect</code>, <code>registerAssetProvider</code>, <code>registerExporter</code> or
              <code> registerPanel</code>. The full API is documented in docs/plugins.md.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
