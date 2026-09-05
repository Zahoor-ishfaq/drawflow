import { Image, Square, Type } from 'lucide-react';
import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { Clip } from './Clip';

const KIND_ICONS = { text: Type, shape: Square, svg: Image, image: Image } as const;

interface TrackProps {
  element: DrawElement;
  rowIndex: number;
  rowCount: number;
  pxPerSec: number;
  contentWidth: number;
  labelWidth: number;
  tFromClientX: (clientX: number) => number;
}

export function Track({
  element: el, rowIndex, rowCount, pxPerSec, contentWidth, labelWidth, tFromClientX,
}: TrackProps) {
  const selected = useStore((s) => s.selectedId === el.id);
  const select = useStore((s) => s.select);
  const Icon = KIND_ICONS[el.kind];

  return (
    <div className="flex">
      <button
        type="button"
        className={
          'sticky left-0 z-30 flex h-7 shrink-0 items-center gap-1.5 border-r border-b border-line px-2 text-left ' +
          (selected ? 'bg-accent-weak' : 'bg-panel hover:bg-panel2')
        }
        style={{ width: labelWidth }}
        onClick={() => select(el.id)}
      >
        <Icon size={12} className="shrink-0 text-t3" />
        <span className="truncate text-[11px] text-t2">{el.label}</span>
      </button>
      <div
        className="relative h-7 border-b border-[#2f2f34]"
        style={{ width: contentWidth }}
      >
        <Clip
          element={el}
          pxPerSec={pxPerSec}
          rowIndex={rowIndex}
          rowCount={rowCount}
          tFromClientX={tFromClientX}
        />
      </div>
    </div>
  );
}
