import { useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { Hand, Layers, LibraryBig, Mic, Sparkles, StickyNote, Type, X } from 'lucide-react';
import { TextPanel } from '../library/TextPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { AudioPanel } from '../library/AudioPanel';
import { HandPanel } from '../library/HandPanel';
import { PaperPanel } from '../library/PaperPanel';
import { AiPanel } from '../library/AiPanel';
import { LayersPanel } from '../library/LayersPanel';
import { usePlugins } from '../../lib/plugins';
import { useEffect, useRef as useRef2 } from 'react';
import { IconButton } from '../ui/IconButton';

type Tool = 'library' | 'text' | 'voice' | 'ai' | 'layers' | 'hand' | 'paper' | `plugin:${string}`;

const ADD_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'library', label: 'Library', Icon: LibraryBig },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'voice', label: 'Voice', Icon: Mic },
  { id: 'ai', label: 'AI', Icon: Sparkles },
];

const SETUP_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'layers', label: 'Layers', Icon: Layers },
  { id: 'hand', label: 'Hand', Icon: Hand },
  { id: 'paper', label: 'Paper', Icon: StickyNote },
];

/** Host for a plugin-provided panel: the plugin renders into a plain element. */
function PluginPanelHost({ id }: { id: string }) {
  const { panels } = usePlugins();
  const panel = panels.find((p) => p.id === id);
  const host = useRef2<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel || !host.current) return;
    const cleanup = panel.mount(host.current);
    return () => { cleanup?.(); };
  }, [panel]);
  return <div ref={host} className="p-4 text-[12.5px]" />;
}

const PANEL_TITLES: Record<string, string> = {
  library: 'Library',
  text: 'Add text',
  voice: 'Voice & sound',
  ai: 'AI assistant',
  layers: 'Layers',
  hand: 'Set hand',
  paper: 'Set paper',
};

function RailButton({
  tool, open, onClick,
}: { tool: { id: Tool; label: string; Icon: typeof Type }; open: boolean; onClick: () => void }) {
  const { Icon, label } = tool;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={
        'df-ui-anim flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition-colors ' +
        (open ? 'bg-accent-weak text-accent' : 'text-t2 hover:bg-hov hover:text-t1')
      }
      onClick={onClick}
    >
      <Icon size={20} strokeWidth={1.8} className="shrink-0" />
      <span className="h-[11px] text-[9.5px] leading-[11px] font-medium">{label}</span>
    </button>
  );
}

export function IconRail() {
  const [open, setOpen] = useState<Tool | null>(null);
  const { panels } = usePlugins();
  const width = useUiStore((s) => s.libraryWidth);
  const setUi = useUiStore((s) => s.set);
  const resize = useRef<{ x: number; w: number } | null>(null);
  const toggle = (id: Tool) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  return (
    <div className="relative z-30 flex shrink-0">
      <div className="flex w-[64px] flex-col items-center gap-1.5 overflow-y-auto border-r border-line bg-panel py-2.5">
        {ADD_TOOLS.map((t) => (
          <RailButton key={t.id} tool={t} open={open === t.id} onClick={() => toggle(t.id)} />
        ))}
        <div className="my-1 h-px w-8 shrink-0 bg-line" />
        {SETUP_TOOLS.map((t) => (
          <RailButton key={t.id} tool={t} open={open === t.id} onClick={() => toggle(t.id)} />
        ))}
        {panels.length > 0 && <div className="my-1 h-px w-8 shrink-0 bg-line" />}
        {panels.map((p) => (
          <RailButton key={p.id} tool={{ id: `plugin:${p.id}`, label: p.label.slice(0, 8), Icon: Sparkles }} open={open === `plugin:${p.id}`} onClick={() => toggle(`plugin:${p.id}`)} />
        ))}
      </div>

      {open && (
        <div className="absolute top-3 left-[72px] flex max-h-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(25,35,55,0.18)]" style={{ width }}>
          <div
            className="absolute top-0 -right-0.5 bottom-0 z-10 w-2 cursor-ew-resize hover:bg-accent/30"
            title="Drag to resize"
            onPointerDown={(e) => { resize.current = { x: e.clientX, w: width }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { const r = resize.current; if (r) setUi({ libraryWidth: Math.max(280, Math.min(620, r.w + (e.clientX - r.x))) }); }}
            onPointerUp={() => { resize.current = null; }}
            onPointerCancel={() => { resize.current = null; }}
          />
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
            <span className="text-[14px] font-semibold">{PANEL_TITLES[open] ?? panels.find((p) => `plugin:${p.id}` === open)?.label ?? 'Plugin'}</span>
            <IconButton label="Close panel" onClick={close}>
              <X size={15} />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">
            {open === 'library' && <LibraryPanel />}
            {open === 'text' && <TextPanel onAdded={close} />}
            {open === 'voice' && <AudioPanel onAdded={close} />}
            {open === 'ai' && <AiPanel />}
            {open === 'layers' && <LayersPanel />}
            {open.startsWith('plugin:') && <PluginPanelHost id={open.slice(7)} />}
            {open === 'hand' && <HandPanel />}
            {open === 'paper' && <PaperPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
