import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Lock, LockOpen } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import type { DrawElement } from '../../types';

const ROW_H = 36;

/**
 * Every element, top-most first. Drag a row (or use the arrows) to change
 * its position: what is drawn later sits on top, so this is both the draw
 * order and the stacking order.
 */
export function LayersPanel() {
  const ordered = useSequence();                 // play order, first → last
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const updateElement = useStore((s) => s.updateElement);
  const reorder = useStore((s) => s.reorder);
  const focusOn = useStore((s) => s.focusOn);
  const [editing, setEditing] = useState<string | null>(null);
  const [lift, setLift] = useState<{ id: string; dy: number } | null>(null);
  const drag = useRef<{ id: string; startY: number; listIndex: number; moved: boolean } | null>(null);
  const rows = [...ordered].reverse();           // top-most first
  const n = rows.length;
  const playIndex = (listIndex: number) => n - 1 - listIndex;

  if (n === 0) {
    return <div className="p-4 text-[12.5px] text-t3">Nothing on the board yet.</div>;
  }

  const onGripDown = (e: React.PointerEvent, el: DrawElement, listIndex: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { id: el.id, startY: e.clientY, listIndex, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 4) return;
    d.moved = true;
    const target = Math.max(0, Math.min(n - 1, d.listIndex + Math.round(dy / ROW_H)));
    if (target !== d.listIndex) {
      reorder(d.id, playIndex(target));
      d.startY += (target - d.listIndex) * ROW_H;
      d.listIndex = target;
    }
    setLift({ id: d.id, dy: e.clientY - d.startY });
  };
  const onGripUp = (e: React.PointerEvent) => {
    drag.current = null;
    setLift(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const row = (el: DrawElement, i: number) => {
    const selected = selectedIds.includes(el.id);
    const lifted = lift?.id === el.id;
    return (
      <div
        key={el.id}
        className={
          'group flex items-center gap-1 rounded-lg px-1 ' +
          (selected ? 'bg-accent-weak ' : 'hover:bg-hov ') +
          (el.hidden ? 'opacity-55 ' : '') +
          (lifted ? 'relative z-20 bg-panel shadow-[0_8px_20px_rgba(25,35,55,0.22)]' : 'transition-transform duration-150')
        }
        style={{ height: ROW_H, transform: lifted ? `translateY(${lift!.dy}px)` : undefined }}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelect(el.id);
          else { select(el.id); focusOn(el.id); }
        }}
        onDoubleClick={() => setEditing(el.id)}
        title={`${el.label} — drawn ${el.zIndex + 1}${el.zIndex === n - 1 ? ' (on top)' : ''}`}
      >
        <span
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-t3 hover:text-t1 active:cursor-grabbing"
          title="Drag to change the order"
          onPointerDown={(e) => onGripDown(e, el, i)}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </span>
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
            {(el.layer ?? 0) !== 0 ? <span className="ml-1 text-[10px] text-t3">layer {el.layer! > 0 ? '+' : ''}{el.layer}</span> : null}
          </span>
        )}
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
          <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-t2 hover:bg-panel hover:text-t1 disabled:opacity-30" title="Move up (drawn later, on top)" disabled={i === 0}
            onClick={(e) => { e.stopPropagation(); reorder(el.id, playIndex(i - 1)); }}>
            <ChevronUp size={13} />
          </button>
          <button type="button" className="flex h-6 w-6 items-center justify-center rounded text-t2 hover:bg-panel hover:text-t1 disabled:opacity-30" title="Move down (drawn earlier, underneath)" disabled={i === n - 1}
            onClick={(e) => { e.stopPropagation(); reorder(el.id, playIndex(i + 1)); }}>
            <ChevronDown size={13} />
          </button>
        </span>
        <button
          type="button"
          className={'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-panel ' + (el.locked ? 'text-accent' : 'text-t3 opacity-0 group-hover:opacity-100')}
          title={el.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => { e.stopPropagation(); updateElement(el.id, { locked: !el.locked }); }}
        >
          {el.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
        <button
          type="button"
          className={'flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-panel ' + (el.hidden ? 'text-accent' : 'text-t3')}
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
        Top-most first — drag the grip or use the arrows to reorder. Numbers are the drawing order; double-click to rename.
      </div>
      {rows.map(row)}
    </div>
  );
}
