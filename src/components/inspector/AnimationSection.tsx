import type { DrawElement, DrawStyle } from '../../types';
import { useStore } from '../../store/useStore';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';

export function AnimationSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const setDurationRipple = useStore((s) => s.setDurationRipple);

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>Animation</SectionHeader>
      <Field label="Style">
        <Segmented<DrawStyle>
          value={el.style}
          onChange={(v) => updateElement(el.id, { style: v })}
          options={[
            { value: 'draw', label: 'Draw' },
            { value: 'appear', label: 'Appear' },
            { value: 'fade', label: 'Fade' },
          ]}
        />
      </Field>
      <Field label="Draw duration (seconds)">
        <Slider
          value={el.drawDuration}
          onChange={(v) => setDurationRipple(el.id, v)}
          min={0.1} max={20} step={0.1}
        />
      </Field>
      <Field label="Starts at (seconds)">
        <NumberInput
          value={el.startTime}
          onChange={(v) => updateElement(el.id, { startTime: Math.max(0, v) })}
          min={0} step={0.1} precision={2}
        />
      </Field>
      <p className="text-[11px] leading-relaxed text-t3">
        Changing the duration shifts everything after this element. Drag cards in
        the strip below to change play order.
      </p>
    </div>
  );
}
