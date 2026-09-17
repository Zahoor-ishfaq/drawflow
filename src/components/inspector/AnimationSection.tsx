import type { CameraMode, DrawElement, DrawStyle, SlideFrom } from '../../types';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { cameraForElement, viewFromRect } from '../../lib/camera';
import { Button } from '../ui/Button';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { HandPicker } from '../library/HandPanel';

export function AnimationSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const project = useStore((s) => s.project);
  const cameraBoundary = useStore((s) => s.cameraBoundary);
  const cameraView = useStore((s) => s.cameraView);
  const sequence = useSequence();
  const index = sequence.findIndex((e) => e.id === el.id);
  const isFirst = index === 0;
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Timing</SectionHeader>
      <Field label={`Animate — seconds to ${el.style === 'draw' ? 'draw' : 'appear'}`}>
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
      <Field label="Effect">
        <Segmented<DrawStyle>
          value={el.style}
          onChange={(v) => patch({ style: v })}
          options={[
            { value: 'draw', label: el.kind === 'image' ? 'Scribble' : 'Draw' },
            { value: 'slide', label: 'Slide in' },
            { value: 'fade', label: 'Fade' },
            { value: 'appear', label: 'Appear' },
          ]}
        />
      </Field>
      {el.style === 'slide' && (
        <Field label="Slide in from">
          <Segmented<SlideFrom>
            value={el.slideFrom}
            onChange={(v) => patch({ slideFrom: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
        </Field>
      )}
      {el.style === 'draw' && (
        <Field label="Drawing hand">
          <HandPicker value={el.hand} onChange={(v) => patch({ hand: v })} allowDefault compact />
        </Field>
      )}
      {el.style === 'draw' && el.kind === 'image' && (
        <p className="text-[11px] leading-relaxed text-t3">
          Photos are revealed with a scribble, the way VideoScribe draws pictures.
        </p>
      )}

      <SectionHeader>Camera</SectionHeader>
      <Field label="Framing while this draws">
        <Segmented<CameraMode>
          value={el.camera}
          onChange={(v) => {
            if (v === 'custom' && !el.customCamera) {
              patch({ camera: 'custom', customCamera: cameraForElement(index, sequence, project) });
            } else {
              patch({ camera: v });
            }
          }}
          options={[
            { value: 'previous', label: 'Stay' },
            { value: 'custom', label: 'This shot' },
            { value: 'auto', label: 'Zoom to it' },
            { value: 'whole', label: 'All' },
          ]}
        />
      </Field>
      {el.camera === 'auto' && (
        <Field label="Zoom tightness">
          <Slider value={el.cameraZoom} onChange={(v) => patch({ cameraZoom: v })} min={0.4} max={2} step={0.05} precision={2} />
        </Field>
      )}
      {!cameraView && cameraBoundary && (
        <Button
          variant="secondary"
          className="justify-center"
          onClick={() => patch({ camera: 'custom', customCamera: viewFromRect(cameraBoundary, project) })}
          title="Record the grey boundary on the canvas as the shot for this element"
        >
          Use the boundary as this element's shot
        </Button>
      )}
      <p className="text-[11px] leading-relaxed text-t3">
        {el.camera === 'previous'
          ? 'Stays: the camera does not move for this element — it keeps the previous shot. Pan the canvas to where you want the camera and press the button above to start a new shot here.'
          : el.camera === 'custom'
            ? 'This element starts a new shot. When its teal frame differs from the grey boundary you can drag the frame (or its corners) to adjust it, or re-aim it with the button above.'
            : el.camera === 'whole'
              ? 'The camera pulls back to show every element.'
              : 'The camera zooms in on this element by itself.'}
      </p>
    </div>
  );
}
