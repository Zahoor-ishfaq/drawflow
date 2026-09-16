import { Check } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { HandStyle } from '../../types';
import { HANDS } from '../../assets/hands';

interface HandPickerProps {
  value: HandStyle | undefined;   // undefined = "use project default" (element override mode)
  onChange: (v: HandStyle | undefined) => void;
  allowDefault?: boolean;
  compact?: boolean;
}

/** Grid of hand thumbnails; shared by the project panel and the element inspector. */
export function HandPicker({ value, onChange, allowDefault = false, compact = false }: HandPickerProps) {
  const projectHand = useStore((s) => s.project.hand);
  const options: { id: HandStyle | undefined; label: string; src?: string; sub?: string }[] = [
    ...(allowDefault
      ? [{ id: undefined, label: 'Project default', sub: HANDS.find((h) => h.id === projectHand)?.label ?? 'No hand' }]
      : []),
    ...HANDS.map((h) => ({ id: h.id as HandStyle, label: h.label, src: h.src, sub: h.description })),
    { id: 'none' as HandStyle, label: 'No hand', sub: 'Lines draw themselves' },
  ];

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id ?? 'default'}
            type="button"
            className={
              'df-ui-anim relative flex flex-col items-center gap-1.5 rounded-xl border-2 bg-white p-2 text-left transition-colors ' +
              (active ? 'border-accent' : 'border-line hover:border-[#b9c2cf]')
            }
            onClick={() => onChange(opt.id)}
            title={opt.sub}
          >
            <div
              className={`flex w-full items-center justify-center overflow-hidden rounded-lg bg-[#f4f6f9] ${compact ? 'h-14' : 'h-20'}`}
            >
              {opt.src ? (
                <img src={opt.src} alt="" className="h-[140%] w-auto max-w-none translate-x-[8%] translate-y-[22%] object-contain" draggable={false} />
              ) : (
                <span className="text-[11px] text-t3">{opt.id === 'none' ? '—' : 'auto'}</span>
              )}
            </div>
            <span className={`w-full truncate text-center text-[11.5px] ${active ? 'font-semibold text-t1' : 'text-t2'}`}>
              {opt.label}
            </span>
            {active && (
              <span className="absolute top-1.5 right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-white">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Project-level "Set hand" panel. */
export function HandPanel() {
  const hand = useStore((s) => s.project.hand);
  const updateProject = useStore((s) => s.updateProject);
  return (
    <div className="flex flex-col gap-3 p-4">
      <HandPicker value={hand} onChange={(v) => updateProject({ hand: v ?? 'marker' })} />
      <p className="text-[11.5px] leading-relaxed text-t3">
        This hand draws every element unless you pick a different one for a specific
        element in its Animation settings.
      </p>
    </div>
  );
}
