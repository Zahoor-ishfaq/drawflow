import { X } from 'lucide-react';
import { SHORTCUTS } from '../../hooks/useKeyboardShortcuts';
import { IconButton } from '../ui/IconButton';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[640px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_60px_rgba(15,25,45,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-line pr-2.5 pl-4">
          <span className="text-[15px] font-semibold">Keyboard shortcuts</span>
          <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
        </div>
        <div className="grid max-h-[calc(85vh-48px)] grid-cols-2 gap-x-6 overflow-y-auto p-4">
          {groups.map((g) => (
            <div key={g} className="mb-4 break-inside-avoid">
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-t3 uppercase">{g}</div>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.keys} className="flex items-center justify-between gap-3 py-1 text-[12.5px]">
                  <span className="text-t1">{s.action}</span>
                  <kbd className="rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-sans text-[11px] whitespace-nowrap text-t2">{s.keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
