import { useState } from 'react';
import { PenTool, Redo2, Undo2 } from 'lucide-react';
import { redo, undo, useCanUndoRedo, useStore } from '../../store/useStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ExportDialog } from '../export/ExportDialog';

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const updateProject = useStore((s) => s.updateProject);
  const isExporting = useStore((s) => s.isExporting);
  const { canUndo, canRedo } = useCanUndoRedo();
  const [showExport, setShowExport] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2">
        <PenTool size={15} className="text-t2" />
        <span className="text-[13px] font-semibold tracking-tight">DrawFlow</span>
      </div>
      <span className="text-t3">▸</span>
      <input
        type="text"
        className="h-6 w-56 rounded-sm border border-transparent bg-transparent px-1.5 text-[13px] text-t1 hover:border-line focus-visible:border-accent"
        value={name}
        onChange={(e) => updateProject({ name: e.target.value })}
        aria-label="Project name"
      />

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={15} />
        </IconButton>
      </div>
      <span className="mx-1 h-4 w-px bg-line" />
      <Button variant="primary" onClick={() => setShowExport(true)} disabled={isExporting}>
        Export
      </Button>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </header>
  );
}
