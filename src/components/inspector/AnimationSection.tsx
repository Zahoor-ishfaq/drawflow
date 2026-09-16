import type { CameraMode, DrawElement, DrawStyle } from '../../types';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { HandPicker } from '../library/HandPanel';

export function AnimationSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const sequence = useSequence();
  const index = sequence.findIndex((e) => e.id === el.id);
  const isFirst = index === 0;
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Timing</SectionHeader>
      <Field label="Animate — seconds to draw">
        <Slider value={el.drawDuration} onChange={(v) => patch({ drawDuration: v })} min={0.1} max={20} step={0.1} />
      </Field>
      <Field label="Pause — hold after drawing">
        <Slider value={el.pauseAfter} onChange={(v) => patch({ pauseAfter: v })} min={0} max={10} step={0.1} />
      </Field>
      <Field label={isFirst ? 'Transition — camera move (first element: none)' : 'Transition — camera move into this'}>
        <Slider
          value={isFirst ? 0 : el.transitionIn}
          onChange={(v) => patch({ transitionIn: v })}
          min={0} max={5} step={0.1}
        />
      </Field>
      <p className="tabular text-[11px] text-t3">
        Starts at {el.startTime.toFixed(1)}s · finishes at {(el.startTime + el.drawDuration + el.pauseAfter).toFixed(1)}s
      </p>

      <SectionHeader>Entrance</SectionHeader>
      <Field label="Style">
        <Segmented<DrawStyle>
          value={el.style}
          onChange={(v) => patch({ style: v })}
          options={[
            { value: 'draw', label: 'Hand draw' },
            { value: 'appear', label: 'Appear' },
            { value: 'fade', label: 'Fade in' },
          ]}
        />
      </Field>
      {el.style === 'draw' && (
        <Field label="Drawing hand">
          <HandPicker value={el.hand} onChange={(v) => patch({ hand: v })} allowDefault compact />
        </Field>
      )}

      <SectionHeader>Camera</SectionHeader>
      <Field label="Framing while this draws">
        <Segmented<CameraMode>
          value={el.camera === 'custom' ? 'auto' : el.camera}
          onChange={(v) => patch({ camera: v })}
          options={[
            { value: 'auto', label: 'Zoom to it' },
            { value: 'previous', label: 'Stay' },
            { value: 'whole', label: 'Whole' },
          ]}
        />
      </Field>
      {el.camera === 'auto' && (
        <Field label="Zoom tightness">
          <Slider value={el.cameraZoom} onChange={(v) => patch({ cameraZoom: v })} min={0.4} max={2} step={0.05} precision={2} />
        </Field>
      )}
      <p className="text-[11px] leading-relaxed text-t3">
        Switch to <span className="font-medium text-t2">Camera view</span> above the canvas to see
        exactly what the video will show at any moment.
      </p>
    </div>
  );
}
