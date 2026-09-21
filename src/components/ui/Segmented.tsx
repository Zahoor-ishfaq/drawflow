interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  'data-tour'?: string;
}

export function Segmented<T extends string>({ value, options, onChange, className = '', ...rest }: SegmentedProps<T>) {
  return (
    <div
      className={`flex rounded-full border border-line bg-panel2 p-0.5 ${className}`}
      role="tablist"
      data-tour={rest['data-tour']}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={
            `df-ui-anim h-6.5 min-w-0 flex-1 truncate whitespace-nowrap rounded-full px-2 text-[12px] font-medium transition-all ` +
            (opt.value === value
              ? 'bg-panel text-t1 shadow-[0_1px_4px_rgba(20,30,50,0.15)]'
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
