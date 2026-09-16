import { useState } from 'react';
import { FileUp, Hand, LayoutGrid, Music, Shapes, StickyNote, Type, X } from 'lucide-react';
import { TextPanel } from '../library/TextPanel';
import { ShapesPanel } from '../library/ShapesPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { Dropzone } from '../library/Dropzone';
import { AudioPanel } from '../library/AudioPanel';
import { HandPanel } from '../library/HandPanel';
import { PaperPanel } from '../library/PaperPanel';
import { IconButton } from '../ui/IconButton';

type Tool = 'text' | 'shapes' | 'library' | 'import' | 'music' | 'hand' | 'paper';

const ADD_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'library', label: 'Images', Icon: LayoutGrid },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'shapes', label: 'Shapes', Icon: Shapes },
  { id: 'import', label: 'Import', Icon: FileUp },
  { id: 'music', label: 'Music', Icon: Music },
];

const SETUP_TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'hand', label: 'Hand', Icon: Hand },
  { id: 'paper', label: 'Paper', Icon: StickyNote },
];

const PANEL_TITLES: Record<Tool, string> = {
  text: 'Add text',
  shapes: 'Add a shape',
  library: 'Image library',
  import: 'Import SVG',
  music: 'Music',
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
        <div className="absolute top-3 left-[72px] flex max-h-[calc(100%-24px)] w-[300px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
            <span className="text-[14px] font-semibold">{PANEL_TITLES[open]}</span>
            <IconButton label="Close panel" onClick={() => setOpen(null)}>
              <X size={15} />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">
            {open === 'text' && <TextPanel onAdded={() => setOpen(null)} />}
            {open === 'shapes' && <ShapesPanel />}
            {open === 'library' && <LibraryPanel />}
            {open === 'import' && (
              <div className="p-4">
                <Dropzone />
                <p className="mt-3 text-[11.5px] leading-relaxed text-t3">
                  Outline (stroke-based) SVGs draw best. Rectangles, circles and other
                  primitives are converted to drawable paths automatically.
                </p>
              </div>
            )}
            {open === 'music' && <AudioPanel />}
            {open === 'hand' && <HandPanel />}
            {open === 'paper' && <PaperPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
