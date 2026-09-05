interface ColorInputProps {
  value: string; // hex or 'none'
  onChange: (v: string) => void;
  allowNone?: boolean;
}

export function ColorInput({ value, onChange, allowNone = false }: ColorInputProps) {
  const isNone = value === 'none';
  return (
    <div className="flex items-center gap-1.5">
      {isNone ? (
        <button
          type="button"
          title="No fill — click to enable"
          className="relative h-[26px] w-[26px] shrink-0 rounded-sm border border-line bg-panel2"
          onClick={() => onChange('#4f8cff')}
        >
          <span className="absolute inset-[5px] rotate-45 border-t border-red-400/80" />
        </button>
      ) : (
        <input
          type="color"
          className="df-color shrink-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <input
        type="text"
        className="df-input tabular flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {allowNone && !isNone && (
        <button
          type="button"
          className="text-[11px] text-t3 hover:text-t2"
          onClick={() => onChange('none')}
        >
          none
        </button>
      )}
    </div>
  );
}
