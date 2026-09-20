import type {
  CameraMode, Direction, DrawElement, DrawStyle, EmphasisKind, ExitKind, MotionEasing, RevealMode, StrokeOrder,
} from '../../types';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { cameraForElement, viewFromRect } from '../../lib/camera';
import { slotEnd, exitWindow } from '../../lib/timing';
import { Button } from '../ui/Button';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { HandPicker } from '../library/HandPanel';
import { usePlugins, PLUGIN_EFFECT_PREFIX } from '../../lib/plugins';

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

const EASINGS: { value: MotionEasing; label: string }[] = [
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeInOut', label: 'Smooth' },
  { value: 'linear', label: 'Linear' },
];

const STROKE_ORDERS: { value: StrokeOrder; label: string }[] = [
  { value: 'file', label: 'As drawn in the file' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'leftToRight', label: 'Left → right' },
  { value: 'rightToLeft', label: 'Right → left' },
  { value: 'topToBottom', label: 'Top → bottom' },
  { value: 'bottomToTop', label: 'Bottom → top' },
  { value: 'centerOut', label: 'Centre outwards' },
];

const REVEALS: { value: RevealMode; label: string }[] = [
  { value: 'scribble', label: 'Scribble' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'radial', label: 'Radial' },
  { value: 'center', label: 'From centre' },
];

const EMPHASIS: { value: EmphasisKind | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'shake', label: 'Shake' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'spin', label: 'Spin' },
  { value: 'grow', label: 'Grow' },
  { value: 'highlight', label: 'Highlight' },
];

const EXITS: { value: ExitKind | 'none'; label: string }[] = [
  { value: 'none', label: 'Stays on the board' },
  { value: 'fade', label: 'Fade out' },
  { value: 'slide', label: 'Slide out' },
  { value: 'wipe', label: 'Wipe out' },
  { value: 'shrink', label: 'Shrink away' },
  { value: 'erase', label: 'Erase (hand rubs it out)' },
  { value: 'reverseDraw', label: 'Reverse draw' },
];

function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="df-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function AnimationSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const project = useStore((s) => s.project);
  const cameraBoundary = useStore((s) => s.cameraBoundary);
  const cameraView = useStore((s) => s.cameraView);
  const sequence = useSequence();
  const index = sequence.findIndex((e) => e.id === el.id);
  const isFirst = index === 0;
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);
  const isImage = el.kind === 'image';
  const isText = el.kind === 'text';
  const hasScenes = (project.scenes?.length ?? 0) > 0;
  const { effects: pluginEffects } = usePlugins();
  const pluginOpts = (kind: 'entrance' | 'emphasis' | 'exit') =>
    pluginEffects.filter((e) => e.kind === kind).map((e) => ({ value: `${PLUGIN_EFFECT_PREFIX}${e.id}` as never, label: `${e.label} (plugin)` }));

  const entranceOptions: { value: DrawStyle; label: string }[] = [
    { value: 'draw', label: isImage ? 'Hand reveals it' : 'Hand draws it' },
    { value: 'slide', label: 'Slide in' },
    { value: 'wipe', label: 'Wipe in' },
    { value: 'fade', label: 'Fade in' },
    { value: 'scale', label: 'Scale in' },
    { value: 'pop', label: 'Pop' },
    { value: 'bounce', label: 'Bounce in' },
    ...(isText ? [{ value: 'typewriter' as DrawStyle, label: 'Typewriter' }] : []),
    { value: 'appear', label: 'Appear' },
    ...(pluginOpts('entrance') as { value: DrawStyle; label: string }[]),
  ];

  const exitW = exitWindow(el);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Timing</SectionHeader>
      <Field label={`Animate — seconds to ${el.style === 'draw' ? 'draw' : 'appear'}`}>
        <Slider value={el.drawDuration} onChange={(v) => patch({ drawDuration: v })} min={0.1} max={20} step={0.1} />
      </Field>
      <Field label="Pause — hold after drawing">
        <Slider value={el.pauseAfter} onChange={(v) => patch({ pauseAfter: v })} min={0} max={10} step={0.1} />
      </Field>
      {!el.withPrevious && (
        <Field label={isFirst ? 'Transition — camera move (first element: none)' : 'Transition — camera move into this'}>
          <Slider
            value={isFirst ? 0 : el.transitionIn}
            onChange={(v) => patch({ transitionIn: v })}
            min={0} max={5} step={0.1}
          />
        </Field>
      )}
      {!isFirst && (
        <label className="flex items-center gap-2 text-[12px] text-t2">
          <input
            type="checkbox"
            checked={!!el.withPrevious}
            onChange={(e) => patch({ withPrevious: e.target.checked, ...(e.target.checked ? { camera: 'previous' as CameraMode } : {}) })}
          />
          Start together with the previous element
        </label>
      )}
      <p className="tabular text-[11px] text-t3">
        Starts at {el.startTime.toFixed(1)}s · finishes at {slotEnd(el).toFixed(1)}s
        {exitW ? ` · leaves at ${exitW.end.toFixed(1)}s` : ''}
      </p>

      <SectionHeader>Entrance</SectionHeader>
      <Field label="Effect">
        <Select value={el.style} options={entranceOptions} onChange={(v) => patch({ style: v })} />
      </Field>
      {(el.style === 'slide' || el.style === 'wipe') && (
        <Field label={el.style === 'slide' ? 'Slide in from' : 'Wipe from'}>
          <Segmented<Direction> value={el.slideFrom ?? 'left'} onChange={(v) => patch({ slideFrom: v })} options={DIRECTIONS} />
        </Field>
      )}
      {['fade', 'slide', 'wipe', 'scale'].includes(el.style) && (
        <Field label="Easing">
          <Segmented<MotionEasing> value={el.easing ?? 'easeOut'} onChange={(v) => patch({ easing: v })} options={EASINGS} />
        </Field>
      )}
      {el.style === 'draw' && !isImage && el.paths.length > 1 && (
        <Field label="Stroke order">
          <Select value={el.strokeOrder ?? 'file'} options={STROKE_ORDERS} onChange={(v) => patch({ strokeOrder: v })} />
        </Field>
      )}
      {el.style === 'draw' && isImage && (
        <>
          <Field label="Reveal">
            <Segmented<RevealMode> value={el.revealMode ?? 'scribble'} onChange={(v) => patch({ revealMode: v })} options={REVEALS} />
          </Field>
          {el.revealMode === 'wipe' && (
            <Field label="Wipe from">
              <Segmented<Direction> value={el.slideFrom ?? 'left'} onChange={(v) => patch({ slideFrom: v })} options={DIRECTIONS} />
            </Field>
          )}
        </>
      )}
      {(el.style === 'draw' || el.exit?.kind === 'erase' || el.exit?.kind === 'reverseDraw') && (
        <Field label="Drawing hand">
          <HandPicker value={el.hand} onChange={(v) => patch({ hand: v })} allowDefault compact />
        </Field>
      )}

      <SectionHeader>Emphasis</SectionHeader>
      <Field label="After it is drawn">
        <Select<EmphasisKind | 'none'>
          value={el.emphasis?.kind ?? 'none'}
          options={[...EMPHASIS, ...(pluginOpts('emphasis') as { value: EmphasisKind; label: string }[])]}
          onChange={(v) => patch({
            emphasis: v === 'none' ? null : { kind: v, duration: el.emphasis?.duration ?? 0.8, delay: el.emphasis?.delay ?? 0.2, repeat: el.emphasis?.repeat ?? 2 },
          })}
        />
      </Field>
      {el.emphasis && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Each">
            <Slider value={el.emphasis.duration} onChange={(v) => patch({ emphasis: { ...el.emphasis!, duration: v } })} min={0.1} max={5} step={0.1} withInput={false} />
          </Field>
          <Field label="Times">
            <Slider value={el.emphasis.repeat} onChange={(v) => patch({ emphasis: { ...el.emphasis!, repeat: Math.round(v) } })} min={1} max={10} step={1} precision={0} withInput={false} />
          </Field>
          <Field label="Delay">
            <Slider value={el.emphasis.delay} onChange={(v) => patch({ emphasis: { ...el.emphasis!, delay: v } })} min={0} max={5} step={0.1} withInput={false} />
          </Field>
          <p className="tabular col-span-3 -mt-1 text-[11px] text-t3">
            {el.emphasis.kind} {el.emphasis.repeat}× {el.emphasis.duration.toFixed(1)}s, {el.emphasis.delay.toFixed(1)}s after drawing — the next element waits for it
          </p>
        </div>
      )}

      <SectionHeader>Exit</SectionHeader>
      <Field label="Leaves the board">
        <Select<ExitKind | 'none'>
          value={el.exit?.kind ?? 'none'}
          options={[...EXITS, ...(pluginOpts('exit') as { value: ExitKind; label: string }[])]}
          onChange={(v) => patch({
            exit: v === 'none' ? null : { kind: v, duration: el.exit?.duration ?? 0.8, delay: el.exit?.delay ?? 0, direction: el.exit?.direction ?? 'right' },
          })}
        />
      </Field>
      {el.exit && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Takes">
              <Slider value={el.exit.duration} onChange={(v) => patch({ exit: { ...el.exit!, duration: v } })} min={0.1} max={10} step={0.1} withInput={false} />
            </Field>
            <Field label="After its pause">
              <Slider value={el.exit.delay} onChange={(v) => patch({ exit: { ...el.exit!, delay: v } })} min={0} max={60} step={0.5} withInput={false} />
            </Field>
          </div>
          {(el.exit.kind === 'slide' || el.exit.kind === 'wipe') && (
            <Field label="Towards">
              <Segmented<Direction> value={el.exit.direction} onChange={(v) => patch({ exit: { ...el.exit!, direction: v } })} options={DIRECTIONS} />
            </Field>
          )}
          <p className="tabular text-[11px] text-t3">
            Leaves {el.exit.delay.toFixed(1)}s after its pause, over {el.exit.duration.toFixed(1)}s — later elements keep drawing meanwhile.
          </p>
        </>
      )}

      <SectionHeader>Camera</SectionHeader>
      <Field label="Framing while this draws">
        <Segmented<CameraMode>
          value={el.camera === 'scene' && !hasScenes ? 'whole' : el.camera}
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
            ...(hasScenes ? [{ value: 'scene' as CameraMode, label: 'Scene' }] : []),
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
              : el.camera === 'scene'
                ? 'The camera frames everything in this scene.'
                : 'The camera zooms in on this element by itself.'}
      </p>
    </div>
  );
}
