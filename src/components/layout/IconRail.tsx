import { useState } from 'react';
import { FileUp, LayoutGrid, Music, Shapes, Type, X } from 'lucide-react';
import { TextPanel } from '../library/TextPanel';
import { ShapesPanel } from '../library/ShapesPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { Dropzone } from '../library/Dropzone';
import { AudioPanel } from '../library/AudioPanel';
import { IconButton } from '../ui/IconButton';

type Tool = 'text' | 'shapes' | 'library' | 'import' | 'music';

const TOOLS: { id: Tool; label: string; Icon: typeof Type }[] = [
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'shapes', label: 'Shapes', Icon: Shapes },
  { id: 'library', label: 'Image library', Icon: LayoutGrid },
  { id: 'import', label: 'Import SVG', Icon: FileUp },
  { id: 'music', label: 'Music', Icon: Music },
];

const PANEL_TITLES: Record<Tool, string> = {
  text: 'Add text',
  shapes: 'Shapes',
  library: 'Image library',
  import: 'Import SVG',
  music: 'Music',
};

export function IconRail() {
  const [open, setOpen] = useState<Tool | null>(null);

  return (
    <div className="relative z-30 flex shrink-0">
      {/* icon rail */}
      <div className="flex w-[64px] flex-col items-center gap-1 border-r border-line bg-panel py-3">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            className={
              'df-ui-anim flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ' +
              (open === id
                ? 'bg-accent-weak text-accent'
                : 'text-t2 hover:bg-hov hover:text-t1')
            }
            onClick={() => setOpen((cur) => (cur === id ? null : id))}
          >
            <Icon size={19} />
            <span className="text-[9.5px] leading-none font-medium">{label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* flyout panel */}
      {open && (
        <div className="absolute top-3 left-[72px] flex max-h-[calc(100%-24px)] w-[290px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
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
                  Outline (stroke-based) SVGs draw best. Shapes like rectangles and
                  circles are converted to drawable paths automatically.
                </p>
              </div>
            )}
            {open === 'music' && <AudioPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
