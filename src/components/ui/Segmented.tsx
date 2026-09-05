interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div
      className={`flex rounded-sm border border-line bg-panel2 p-0.5 ${className}`}
      role="tablist"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={
            `df-ui-anim h-6 flex-1 rounded-[4px] px-2 text-[12px] transition-colors ` +
            (opt.value === value
              ? 'bg-hov text-t1'
              : 'text-t2 hover:text-t1')
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
