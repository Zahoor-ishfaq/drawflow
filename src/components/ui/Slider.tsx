import { NumberInput } from './NumberInput';

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  /** show the editable numeric value next to the track */
  withInput?: boolean;
}

export function Slider({
  value, onChange, min, max, step = 0.1, precision = 1, withInput = true,
}: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="df-slider flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {withInput && (
        <NumberInput
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          precision={precision}
          className="w-14 shrink-0"
        />
      )}
    </div>
  );
}
