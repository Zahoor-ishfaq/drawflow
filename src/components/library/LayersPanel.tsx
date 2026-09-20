import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { sortedByZ } from '../../lib/renderFrame';
import type { DrawElement } from '../../types';

/** Every element, top-most first, with visibility/lock toggles and stacking controls. */
export function LayersPanel() {
  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const updateElement = useStore((s) => s.updateElement);
  const setLayer = useStore((s) => s.setLayer);
  const focusOn = useStore((s) => s.focusOn);
  const [editing, setEditing] = useState<string | null>(null);
  const stacked = sortedByZ(elements).reverse();

  if (elements.length === 0) {
    return <div className="p-4 text-[12.5px] text-t3">Nothing on the board yet.</div>;
  }

  const row = (el: DrawElement, i: number) => {
    const selected = selectedIds.includes(el.id);
    return (
      <div
        key={el.id}
        className={
          'group flex h-9 items-center gap-1.5 rounded-lg px-1.5 ' +
          (selected ? 'bg-accent-weak' : 'hover:bg-hov') +
          (el.hidden ? ' opacity-55' : '')
        }
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelect(el.id);
          else { select(el.id); focusOn(el.id); }
        }}
        onDoubleClick={() => setEditing(el.id)}
        title={`${el.label} — draws ${el.zIndex + 1}${(el.layer ?? 0) ? `, layer ${el.layer}` : ''}`}
      >
        <span className="tabular w-5 shrink-0 text-right text-[10.5px] text-t3">{el.zIndex + 1}</span>
        {editing === el.id ? (
          <input
            autoFocus
            className="df-input !h-6 min-w-0 flex-1 !px-1.5 text-[12px]"
            defaultValue={el.label}
            onBlur={(e) => { updateElement(el.id, { label: e.target.value.trim() || el.label }); setEditing(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={'min-w-0 flex-1 truncate text-[12.5px] ' + (selected ? 'font-medium text-t1' : 'text-t1')}>
            {el.label}
            {el.groupChildren?.length ? <span className="ml-1 text-[10px] text-t3">group</span> : null}
          </span>
        )}
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
          <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-t2 hover:bg-white hover:text-t1 disabled:opacity-30" title="Bring forward" disabled={i === 0}
            onClick={(e) => { e.stopPropagation(); setLayer([el.id], 'forward'); }}>
            <ChevronUp size={13} />
          </button>
          <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-t2 hover:bg-white hover:text-t1 disabled:opacity-30" title="Send backward" disabled={i === stacked.length - 1}
            onClick={(e) => { e.stopPropagation(); setLayer([el.id], 'backward'); }}>
            <ChevronDown size={13} />
          </button>
        </span>
        <button
          type="button"
          className={'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white ' + (el.locked ? 'text-accent' : 'text-t3 opacity-0 group-hover:opacity-100')}
          title={el.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => { e.stopPropagation(); updateElement(el.id, { locked: !el.locked }); }}
        >
          {el.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
        <button
          type="button"
          className={'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white ' + (el.hidden ? 'text-accent' : 'text-t3')}
          title={el.hidden ? 'Show in the video' : 'Hide from the video'}
          onClick={(e) => { e.stopPropagation(); updateElement(el.id, { hidden: !el.hidden }); }}
        >
          {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col p-2">
      <div className="px-1.5 pb-1.5 text-[11px] text-t3">
        Top-most first. Numbers are the drawing order; double-click to rename.
      </div>
      {stacked.map(row)}
    </div>
  );
}
