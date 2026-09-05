import { useState } from 'react';
import { Clapperboard, PenTool, Redo2, Undo2 } from 'lucide-react';
import { redo, undo, useCanUndoRedo, useStore } from '../../store/useStore';
import type { HandStyle } from '../../types';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ExportDialog } from '../export/ExportDialog';

const HAND_OPTIONS: { value: HandStyle; label: string }[] = [
  { value: 'marker', label: 'Marker hand' },
  { value: 'pencil', label: 'Pencil hand' },
  { value: 'chalk', label: 'Chalk hand' },
  { value: 'none', label: 'No hand' },
];

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const updateProject = useStore((s) => s.updateProject);
  const isExporting = useStore((s) => s.isExporting);
  const handStyle = useStore((s) => s.handStyle);
  const setHandStyle = useStore((s) => s.setHandStyle);
  const { canUndo, canRedo } = useCanUndoRedo();
  const [showExport, setShowExport] = useState(false);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <PenTool size={16} />
        </span>
        <span className="text-[15px] font-bold tracking-tight">DrawFlow</span>
      </div>
      <span className="h-5 w-px bg-line" />
      <input
        type="text"
        className="h-8 w-52 rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-t1 hover:border-line hover:bg-panel2 focus-visible:border-accent"
        value={name}
        onChange={(e) => updateProject({ name: e.target.value })}
        aria-label="Project name"
      />

      <div className="flex-1" />

      <select
        className="df-input !h-8 !w-auto !rounded-full !bg-panel pr-2 pl-3 text-[12px]"
        value={handStyle}
        onChange={(e) => setHandStyle(e.target.value as HandStyle)}
        title="Drawing hand"
        aria-label="Drawing hand"
      >
        {HAND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconButton>
      </div>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <Button variant="primary" onClick={() => setShowExport(true)} disabled={isExporting}>
        <Clapperboard size={15} />
        Export video
      </Button>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </header>
  );
}
