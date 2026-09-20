import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuEntry {
  label?: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** a divider */
  separator?: boolean;
  /** nested entries (shown inline, indented) */
  children?: MenuEntry[];
}

/** Right-click menu anchored at a screen point; closes on click, Esc or outside. */
export function ContextMenu({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const render = (items: MenuEntry[], depth = 0) => items.map((m, i) => {
    if (m.separator) return <div key={`sep-${depth}-${i}`} className="my-1 h-px bg-line" />;
    return (
      <div key={`${depth}-${i}`}>
        <button
          type="button"
          disabled={m.disabled || (!m.onClick && !!m.children)}
          className={
            'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px] disabled:opacity-40 ' +
            (m.children && !m.onClick ? 'cursor-default font-medium text-t3 ' : 'hover:bg-hov ') +
            (m.danger ? 'text-red-600 hover:!bg-red-50' : 'text-t1')
          }
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => { if (m.onClick) { onClose(); m.onClick(); } }}
        >
          <span className="flex w-4 shrink-0 justify-center text-t2">{m.icon}</span>
          <span className="flex-1 truncate whitespace-nowrap">{m.label}</span>
          {m.hint && <span className="shrink-0 text-[10.5px] text-t3">{m.hint}</span>}
        </button>
        {m.children && render(m.children, depth + 1)}
      </div>
    );
  });

  return (
    <div
      ref={ref}
      className="fixed z-[80] w-[260px] rounded-xl border border-line bg-panel p-1.5 shadow-[0_12px_40px_rgba(25,35,55,0.22)]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {render(entries)}
    </div>
  );
}

/** Hook: state + handler for a right-click menu. */
export function useContextMenu<T>() {
  const [menu, setMenu] = useState<{ x: number; y: number; target: T } | null>(null);
  const open = (e: React.MouseEvent, target: T) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, target });
  };
  return { menu, open, close: () => setMenu(null) };
}
