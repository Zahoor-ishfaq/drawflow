import { useState } from 'react';
import { Hand, Image, Music, Shapes, Sparkles, StickyNote, Type, X } from 'lucide-react';
import { TextPanel } from '../library/TextPanel';
import { ShapesPanel } from '../library/ShapesPanel';
import { ImagesPanel } from '../library/ImagesPanel';
import { AudioPanel } from '../library/AudioPanel';
import { HandPanel } from '../library/HandPanel';
import { PaperPanel } from '../library/PaperPanel';
import { AiPanel } from '../library/AiPanel';
import { IconButton } from '../ui/IconButton';

type Tool = 'images' | 'text' | 'shapes' | 'music' | 'ai' | 'hand' | 'paper';

const ADD_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'images', label: 'Images', Icon: Image },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'shapes', label: 'Shapes', Icon: Shapes },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'ai', label: 'AI', Icon: Sparkles },
];

const SETUP_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'hand', label: 'Hand', Icon: Hand },
  { id: 'paper', label: 'Paper', Icon: StickyNote },
];

const PANEL_TITLES: Record<Tool, string> = {
  images: 'Images',
  text: 'Add text',
  shapes: 'Shapes & icons',
  music: 'Music',
  ai: 'AI assistant',
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
        'df-ui-anim flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ' +
        (open ? 'bg-accent-weak text-accent' : 'text-t2 hover:bg-hov hover:text-t1')
      }
      onClick={onClick}
    >
      <Icon size={19} />
      <span className="text-[9.5px] leading-none font-medium">{label}</span>
    </button>
  );
}

export function IconRail() {
  const [open, setOpen] = useState<Tool | null>(null);
  const toggle = (id: Tool) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  return (
    <div className="relative z-30 flex shrink-0">
      <div className="flex w-[64px] flex-col items-center gap-1 border-r border-line bg-panel py-3">
        {ADD_TOOLS.map((t) => (
          <RailButton key={t.id} tool={t} open={open === t.id} onClick={() => toggle(t.id)} />
        ))}
        <div className="my-1.5 h-px w-8 bg-line" />
        {SETUP_TOOLS.map((t) => (
          <RailButton key={t.id} tool={t} open={open === t.id} onClick={() => toggle(t.id)} />
        ))}
      </div>

      {open && (
        <div className="absolute top-3 left-[72px] flex max-h-[calc(100%-24px)] w-[340px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
            <span className="text-[14px] font-semibold">{PANEL_TITLES[open]}</span>
            <IconButton label="Close panel" onClick={close}>
              <X size={15} />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">
            {open === 'images' && <ImagesPanel />}
            {open === 'text' && <TextPanel onAdded={close} />}
            {open === 'shapes' && <ShapesPanel />}
            {open === 'music' && <AudioPanel onAdded={close} />}
            {open === 'ai' && <AiPanel />}
            {open === 'hand' && <HandPanel />}
            {open === 'paper' && <PaperPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
