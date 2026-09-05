import { useEffect, useRef, useState } from 'react';
import { clamp } from '../../lib/time';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** decimals shown */
  precision?: number;
  /** optional inline label that supports drag-to-scrub */
  label?: string;
  className?: string;
}

export function NumberInput({
  value, onChange,
  min = -Infinity, max = Infinity,
  step = 1, precision = 0,
  label, className = '',
}: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startV: number } | null>(null);

  const display = draft ?? value.toFixed(precision);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (isFinite(parsed)) onChange(clamp(parsed, min, max));
    setDraft(null);
  };

  useEffect(() => {
    if (!dragRef.current) return undefined;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onChange(clamp(d.startV + (e.clientX - d.startX) * step * 0.5, min, max));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {label && (
        <span
          className="cursor-ew-resize text-[12px] text-t2 select-none"
          onPointerDown={(e) => {
            dragRef.current = { startX: e.clientX, startV: value };
            e.preventDefault();
          }}
        >
          {label}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        className="df-input tabular min-w-0 flex-1"
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    </div>
  );
}
