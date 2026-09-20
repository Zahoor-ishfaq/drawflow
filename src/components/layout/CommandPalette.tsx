import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { redo, undo, useStore } from '../../store/useStore';
import { useUiStore } from '../../store/uiStore';
import { emitShortcut } from '../../hooks/useKeyboardShortcuts';
import { saveNow } from '../../lib/persistence';
import { PAPERS } from '../../assets/paper';
import { allHands } from '../../assets/hands';
import type { DrawStyle, EmphasisKind, ExitKind } from '../../types';

interface Command { id: string; label: string; group: string; keys?: string; run: () => void; when?: () => boolean }

function commands(): Command[] {
  const s = useStore.getState();
  const ui = useUiStore.getState();
  const ids = s.selectedIds;
  const hasSel = () => useStore.getState().selectedIds.length > 0;
  const styles: { v: DrawStyle; l: string }[] = [
    { v: 'draw', l: 'Hand draws it' }, { v: 'slide', l: 'Slide in' }, { v: 'wipe', l: 'Wipe in' }, { v: 'fade', l: 'Fade in' },
    { v: 'scale', l: 'Scale in' }, { v: 'pop', l: 'Pop' }, { v: 'bounce', l: 'Bounce in' }, { v: 'appear', l: 'Appear' },
  ];
  const emph: { v: EmphasisKind; l: string }[] = [{ v: 'pulse', l: 'Pulse' }, { v: 'shake', l: 'Shake' }, { v: 'bounce', l: 'Bounce' }, { v: 'spin', l: 'Spin' }, { v: 'grow', l: 'Grow' }, { v: 'highlight', l: 'Highlight' }];
  const exits: { v: ExitKind; l: string }[] = [{ v: 'fade', l: 'Fade out' }, { v: 'slide', l: 'Slide out' }, { v: 'wipe', l: 'Wipe out' }, { v: 'shrink', l: 'Shrink away' }, { v: 'erase', l: 'Erase' }, { v: 'reverseDraw', l: 'Reverse draw' }];
  return [
    { id: 'play', group: 'Playback', label: s.isPlaying ? 'Pause' : 'Play', keys: 'Space', run: () => (useStore.getState().isPlaying ? s.pause() : s.play()) },
    { id: 'preview', group: 'Playback', label: 'Preview from the start', run: () => { s.setTime(0); s.play(); } },
    { id: 'fullscreen', group: 'Playback', label: 'Full-screen preview', keys: 'Shift+F', run: () => ui.set({ fullscreenPreview: true }) },
    { id: 'marker', group: 'Playback', label: 'Add marker at playhead', keys: 'M', run: () => s.addMarker(useStore.getState().currentTime) },
    { id: 'export', group: 'Project', label: 'Export video…', keys: 'Ctrl+E', run: () => emitShortcut('open-export') },
    { id: 'projects', group: 'Project', label: 'Projects, templates & history…', keys: 'Ctrl+O', run: () => emitShortcut('open-projects') },
    { id: 'templates', group: 'Project', label: 'New from template…', run: () => emitShortcut('open-templates') },
    { id: 'versions', group: 'Project', label: 'Version history…', keys: 'Ctrl+S', run: () => emitShortcut('open-versions') },
    { id: 'save', group: 'Project', label: 'Save checkpoint now', run: () => void saveNow() },
    { id: 'undo', group: 'Edit', label: 'Undo', keys: 'Ctrl+Z', run: undo },
    { id: 'redo', group: 'Edit', label: 'Redo', keys: 'Ctrl+Shift+Z', run: redo },
    { id: 'selectAll', group: 'Edit', label: 'Select all', keys: 'Ctrl+A', run: () => s.selectAll() },
    { id: 'duplicate', group: 'Edit', label: 'Duplicate selection', keys: 'Ctrl+D', run: () => s.duplicateElements(useStore.getState().selectedIds), when: hasSel },
    { id: 'delete', group: 'Edit', label: 'Delete selection', keys: 'Del', run: () => s.removeElements(useStore.getState().selectedIds), when: hasSel },
    { id: 'group', group: 'Edit', label: 'Group selection', keys: 'Ctrl+G', run: () => s.group(useStore.getState().selectedIds), when: () => useStore.getState().selectedIds.length > 1 },
    { id: 'lock', group: 'Edit', label: 'Lock / unlock selection', keys: 'Ctrl+L', run: () => s.updateElements(useStore.getState().selectedIds, (el) => ({ locked: !el.locked })), when: hasSel },
    { id: 'hide', group: 'Edit', label: 'Hide / show selection', keys: 'Ctrl+Shift+H', run: () => s.updateElements(useStore.getState().selectedIds, (el) => ({ hidden: !el.hidden })), when: hasSel },
    { id: 'together', group: 'Edit', label: 'Draw selection together with previous', run: () => s.updateElements(useStore.getState().selectedIds, (el) => ({ withPrevious: !el.withPrevious })), when: hasSel },
    ...styles.map((st) => ({ id: `style-${st.v}`, group: 'Entrance (selection)', label: st.l, run: () => s.updateElements(useStore.getState().selectedIds, { style: st.v }), when: hasSel })),
    ...emph.map((e) => ({ id: `emph-${e.v}`, group: 'Emphasis (selection)', label: e.l, run: () => s.updateElements(useStore.getState().selectedIds, { emphasis: { kind: e.v, duration: 0.8, delay: 0.2, repeat: 2 } }), when: hasSel })),
    { id: 'emph-none', group: 'Emphasis (selection)', label: 'No emphasis', run: () => s.updateElements(useStore.getState().selectedIds, { emphasis: null }), when: hasSel },
    ...exits.map((e) => ({ id: `exit-${e.v}`, group: 'Exit (selection)', label: e.l, run: () => s.updateElements(useStore.getState().selectedIds, { exit: { kind: e.v, duration: 0.8, delay: 0, direction: 'right' } }), when: hasSel })),
    { id: 'exit-none', group: 'Exit (selection)', label: 'Stays on the board', run: () => s.updateElements(useStore.getState().selectedIds, { exit: null }), when: hasSel },
    { id: 'scene-add', group: 'Scenes', label: 'Add scene', run: () => { s.addScene(); } },
    { id: 'zoom-fit', group: 'View', label: 'Fit everything', keys: 'Ctrl+0', run: () => emitShortcut('zoom-fit') },
    { id: 'zoom-sel', group: 'View', label: 'Frame the selection', keys: 'F', run: () => emitShortcut('zoom-selection') },
    { id: 'camera', group: 'View', label: s.cameraView ? 'Edit view' : 'Camera view', run: () => s.setCameraView(!useStore.getState().cameraView) },
    { id: 'rulers', group: 'View', label: `${ui.showRulers ? 'Hide' : 'Show'} rulers`, keys: 'Ctrl+R', run: () => ui.set({ showRulers: !useUiStore.getState().showRulers }) },
    { id: 'snap', group: 'View', label: `${ui.snapToGrid ? 'Disable' : 'Enable'} snap to grid`, keys: "Ctrl+'", run: () => ui.set({ snapToGrid: !useUiStore.getState().snapToGrid }) },
    { id: 'guides', group: 'View', label: `${ui.showGuides ? 'Disable' : 'Enable'} smart guides`, run: () => ui.set({ showGuides: !useUiStore.getState().showGuides }) },
    { id: 'stats', group: 'View', label: `${ui.showStats ? 'Hide' : 'Show'} performance stats`, run: () => ui.set({ showStats: !useUiStore.getState().showStats }) },
    { id: 'lowq', group: 'View', label: `${ui.lowQualityPreview ? 'Disable' : 'Enable'} low-quality preview`, run: () => ui.set({ lowQualityPreview: !useUiStore.getState().lowQualityPreview }) },
    { id: 'theme-light', group: 'View', label: 'Theme: light', run: () => ui.set({ theme: 'light' }) },
    { id: 'theme-dark', group: 'View', label: 'Theme: dark', run: () => ui.set({ theme: 'dark' }) },
    { id: 'theme-system', group: 'View', label: 'Theme: follow system', run: () => ui.set({ theme: 'system' }) },
    { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', keys: '?', run: () => emitShortcut('shortcuts-help') },
    ...PAPERS.map((p) => ({ id: `paper-${p.id}`, group: 'Paper', label: `Paper: ${p.label}`, run: () => s.updateProject({ paper: p.id, background: p.color }) })),
    ...allHands(s.project).map((h) => ({ id: `hand-${h.id}`, group: 'Hand', label: `Hand: ${h.label}`, run: () => s.updateProject({ hand: h.id }) })),
    { id: 'hand-none', group: 'Hand', label: 'Hand: none', run: () => s.updateProject({ hand: 'none' }) },
  ].filter((c) => !c.when || c.when() || ids.length > 0);
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => commands(), []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = all.filter((c) => words.every((w) => `${c.group} ${c.label} ${c.keys ?? ''}`.toLowerCase().includes(w))).slice(0, 40);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command) => { onClose(); c.run(); };

  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center bg-[#101623]/35 pt-[12vh]" onMouseDown={onClose}>
      <div className="w-[560px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-t3" />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-[14px] text-t1 outline-none placeholder:text-t3"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { const c = results[active]; if (c) run(c); }
              else if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="p-3 text-[12.5px] text-t3">No matching command.</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ' + (i === active ? 'bg-accent-weak' : 'hover:bg-hov')}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span className="w-[150px] shrink-0 text-[11px] text-t3">{c.group}</span>
              <span className="flex-1 text-[13px] text-t1">{c.label}</span>
              {c.keys && <kbd className="rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-sans text-[10.5px] text-t2">{c.keys}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
