import type { DrawElement, DrawStyle, HandStyle } from '../../types';
import { useStore } from '../../store/useStore';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { NumberInput } from '../ui/NumberInput';

export function AnimationSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const handStyle = useStore((s) => s.handStyle);
  const setHandStyle = useStore((s) => s.setHandStyle);
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>Animation</SectionHeader>
      <Field label="Draw style">
        <Segmented<DrawStyle>
          value={el.style}
          onChange={(v) => patch({ style: v })}
          options={[
            { value: 'draw', label: 'Draw' },
            { value: 'appear', label: 'Appear' },
            { value: 'fade', label: 'Fade' },
          ]}
        />
      </Field>
      <Field label="Draw duration (s)">
        <Slider
          value={el.drawDuration}
          onChange={(v) => patch({ drawDuration: v })}
          min={0.1} max={20} step={0.1}
        />
      </Field>
      <Field label="Start time (s)">
        <NumberInput
          value={el.startTime}
          onChange={(v) => patch({ startTime: Math.max(0, v) })}
          min={0} step={0.1} precision={2}
        />
      </Field>
      <Field label="Hand">
        <Segmented<HandStyle>
          value={handStyle}
          onChange={setHandStyle}
          options={[
            { value: 'marker', label: 'Marker' },
            { value: 'pencil', label: 'Pencil' },
            { value: 'chalk', label: 'Chalk' },
            { value: 'none', label: 'None' },
          ]}
        />
      </Field>
    </div>
  );
}
