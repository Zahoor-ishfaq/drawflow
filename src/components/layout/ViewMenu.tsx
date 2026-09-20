import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Keyboard, Monitor, Moon, Sun } from 'lucide-react';
import { useUiStore, type Theme } from '../../store/uiStore';
import { emitShortcut } from '../../hooks/useKeyboardShortcuts';

function Row({ label, checked, shortcut, onClick }: { label: string; checked?: boolean; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-t1 hover:bg-hov"
      onClick={onClick}
    >
      <span className="flex w-4 justify-center">{checked && <Check size={13} className="text-accent" />}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-t3">{shortcut}</span>}
    </button>
  );
}

/** View preferences: snapping, rulers, guides, theme, stats. */
export function ViewMenu() {
  const ui = useUiStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const themes: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={
          'df-ui-anim flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-t2 hover:bg-hov hover:text-t1 ' +
          (open ? 'bg-hov text-t1' : '')
        }
        onClick={() => setOpen((v) => !v)}
      >
        View <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-40 w-[250px] rounded-xl border border-line bg-panel p-1.5 shadow-[0_12px_40px_rgba(25,35,55,0.18)]">
          <Row label="Snap to grid" checked={ui.snapToGrid} shortcut="Ctrl+'" onClick={() => ui.set({ snapToGrid: !ui.snapToGrid })} />
          <div className="flex items-center gap-2 px-2 pb-1 pl-8 text-[11.5px] text-t3">
            Grid size
            <select className="df-input !h-6 !w-auto !py-0 text-[11.5px]" value={ui.gridSize} onChange={(e) => ui.set({ gridSize: parseInt(e.target.value, 10) })}>
              {[10, 20, 40, 50, 80, 100].map((g) => <option key={g} value={g}>{g} px</option>)}
            </select>
          </div>
          <Row label="Rulers" checked={ui.showRulers} shortcut="Ctrl+R" onClick={() => ui.set({ showRulers: !ui.showRulers })} />
          <Row label="Smart guides while dragging" checked={ui.showGuides} onClick={() => ui.set({ showGuides: !ui.showGuides })} />
          <Row label="Performance stats" checked={ui.showStats} onClick={() => ui.set({ showStats: !ui.showStats })} />
          <Row label="Low-quality preview (faster)" checked={ui.lowQualityPreview} onClick={() => ui.set({ lowQualityPreview: !ui.lowQualityPreview })} />
          <div className="my-1 h-px bg-line" />
          <div className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-t3 uppercase">Theme</div>
          <div className="flex gap-1 px-1.5 pb-1">
            {themes.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className={
                  'flex h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[12px] ' +
                  (ui.theme === value ? 'bg-accent-weak text-accent' : 'text-t2 hover:bg-hov')
                }
                onClick={() => ui.set({ theme: value })}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <Row label="Full-screen preview" shortcut="Shift+F" onClick={() => { setOpen(false); emitShortcut('fullscreen-preview'); }} />
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-t1 hover:bg-hov"
            onClick={() => { setOpen(false); emitShortcut('shortcuts-help'); }}
          >
            <span className="flex w-4 justify-center"><Keyboard size={13} className="text-t3" /></span>
            <span className="flex-1">Keyboard shortcuts</span>
            <span className="text-[11px] text-t3">?</span>
          </button>
        </div>
      )}
    </div>
  );
}
