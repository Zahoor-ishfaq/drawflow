import { useEffect, useState } from 'react';
import { Download, PenTool, Play, Redo2, Undo2 } from 'lucide-react';
import { redo, undo, useCanUndoRedo, useStore } from '../../store/useStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ExportDialog } from '../export/ExportDialog';
import { ProjectMenu } from './ProjectMenu';
import { ViewMenu } from './ViewMenu';
import { ShortcutsDialog } from './ShortcutsDialog';
import { PluginsDialog } from './PluginsDialog';
import { HelpMenu, OpenSourceButton } from '../help/HelpMenu';
import { onShortcut } from '../../hooks/useKeyboardShortcuts';

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const updateProject = useStore((s) => s.updateProject);
  const isExporting = useStore((s) => s.isExporting);
  const elementCount = useStore((s) => s.elements.length);
  const { canUndo, canRedo } = useCanUndoRedo();
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  useEffect(() => onShortcut((n) => {
    if (n === 'shortcuts-help') setShowShortcuts((v) => !v);
    if (n === 'open-export') setShowExport(true);
    if (n === 'open-plugins') setShowPlugins(true);
  }), []);

  const preview = () => {
    const s = useStore.getState();
    s.setTime(0);
    s.play();
  };

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

      <ProjectMenu />
      <ViewMenu />

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconButton>
      </div>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <Button variant="secondary" onClick={preview} disabled={elementCount === 0} data-tour="preview">
        <Play size={14} />
        Preview
      </Button>
      <Button variant="primary" onClick={() => setShowExport(true)} disabled={isExporting || elementCount === 0} data-tour="download">
        <Download size={15} />
        Download video
      </Button>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <HelpMenu />
      <OpenSourceButton />

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {showPlugins && <PluginsDialog onClose={() => setShowPlugins(false)} />}
    </header>
  );
}
