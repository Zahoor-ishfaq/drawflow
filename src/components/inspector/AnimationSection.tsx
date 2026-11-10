import type {
  CameraMode, Direction, DrawElement, DrawStyle, EmphasisKind, ExitKind, MotionEasing, MotionPath, MotionPoint, RevealMode, StrokeOrder,
} from '../../types';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/uiStore';
import { useSequence } from '../../store/selectors';
import { cameraForElement, viewFromRect } from '../../lib/camera';
import { slotEnd, exitWindow, motionWindow } from '../../lib/timing';
import { Camera, Crosshair, Route } from 'lucide-react';
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

type RouteChoice = 'none' | 'draw' | 'arcLeft' | 'arcRight' | 'wave' | 'left' | 'right' | 'up';

const FACINGS: { value: Direction; label: string }[] = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'top', label: 'Up' },
  { value: 'bottom', label: 'Down' },
];

const ROUTES: { value: RouteChoice; label: string }[] = [
  { value: 'none', label: 'Stays where it is' },
  { value: 'draw', label: 'Draw my own path on the board…' },
  { value: 'arcLeft', label: 'Fly up and to the left' },
  { value: 'arcRight', label: 'Fly up and to the right' },
  { value: 'wave', label: 'Wave to the right' },
  { value: 'left', label: 'Straight to the left' },
  { value: 'right', label: 'Straight to the right' },
  { value: 'up', label: 'Straight up' },
];

/** Ready-made routes, sized to the board, as offsets from the element's centre. */
function presetRoute(kind: RouteChoice, w: number, h: number): MotionPoint[] {
  const p = (x: number, y: number) => ({ x: Math.round(x * w), y: Math.round(y * h) });
  switch (kind) {
    case 'arcLeft': return [p(0, 0), p(-0.22, -0.2), p(-0.5, -0.3)];
    case 'arcRight': return [p(0, 0), p(0.22, -0.2), p(0.5, -0.3)];
    case 'wave': return [p(0, 0), p(0.12, -0.1), p(0.24, 0.05), p(0.36, -0.1), p(0.48, 0)];
    case 'left': return [p(0, 0), p(-0.5, 0)];
    case 'right': return [p(0, 0), p(0.5, 0)];
    case 'up': return [p(0, 0), p(0, -0.45)];
    default: return [p(0, 0)];
  }
}

/** Inspector controls for an element's motion path (travel along a route after appearing). */
function MotionPathControls({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const setCameraView = useStore((s) => s.setCameraView);
  const project = useStore((s) => s.project);
  const pathEditId = useUiStore((s) => s.pathEditId);
  const setUi = useUiStore((s) => s.set);
  const m = el.motion;
  const editing = pathEditId === el.id;
  const patchMotion = (p: Partial<MotionPath>) => m && updateElement(el.id, { motion: { ...m, ...p } });
  const w = motionWindow(el);

  const choose = (v: RouteChoice) => {
    if (v === 'none') { updateElement(el.id, { motion: null }); setUi({ pathEditId: null }); return; }
    const points = presetRoute(v, project.width, project.height);
    updateElement(el.id, { motion: { points, duration: m?.duration ?? 3, delay: m?.delay ?? 0, easing: m?.easing ?? 'easeInOut', ...(m?.orient ? { orient: true } : {}), ...(m?.smooth === false ? { smooth: false } : {}) } });
    if (v === 'draw') { setCameraView(false); setUi({ pathEditId: el.id }); } else setUi({ pathEditId: null });
  };

  return (
    <>
      <SectionHeader>Motion path</SectionHeader>
      <Field label="Travel after it appears">
        <Select<RouteChoice> value={m ? 'draw' : 'none'} options={m ? [{ value: 'draw', label: `Along its path (${m.points.length} points)` }, ...ROUTES.filter((r) => r.value !== 'draw')] : ROUTES} onChange={choose} />
      </Field>
      {m && (
        <>
          <div className="flex gap-2">
            <Button
              variant={editing ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => { if (editing) setUi({ pathEditId: null }); else { setCameraView(false); setUi({ pathEditId: el.id }); } }}
            >
              <Route size={14} /> {editing ? 'Done' : 'Edit path on the board'}
            </Button>
          </div>
          {editing && (
            <p className="text-[11px] leading-snug text-accent">
              Click the board to add points; drag a point to move it. Backspace removes the last point, Enter finishes.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Takes">
              <Slider value={m.duration} onChange={(v) => patchMotion({ duration: v })} min={0.2} max={30} step={0.1} withInput={false} />
            </Field>
            <Field label="Sets off after">
              <Slider value={m.delay} onChange={(v) => patchMotion({ delay: v })} min={0} max={30} step={0.1} withInput={false} />
            </Field>
          </div>
          <Field label="Speed">
            <Segmented<MotionEasing> value={m.easing ?? 'easeInOut'} onChange={(v) => patchMotion({ easing: v })} options={EASINGS} />
          </Field>
          <label className="flex items-center gap-2 text-[12px] text-t2">
            <input type="checkbox" checked={!!m.orient} onChange={(e) => patchMotion({ orient: e.target.checked || undefined })} />
            Turn to face the direction of travel
          </label>
          {m.orient && (
            <Field label="The picture faces">
              <Segmented<Direction> value={m.facing ?? 'right'} onChange={(v) => patchMotion({ facing: v === 'right' ? undefined : v })} options={FACINGS} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-[12px] text-t2">
            <input type="checkbox" checked={m.smooth !== false} onChange={(e) => patchMotion({ smooth: e.target.checked ? undefined : false })} />
            Smooth curve through the points
          </label>
          <p className="tabular text-[11px] text-t3">
            {w
              ? `Sets off at ${w.start.toFixed(1)}s, arrives at ${w.end.toFixed(1)}s and stays there; later elements keep drawing meanwhile.`
              : 'Add at least one more point on the board to give it somewhere to go.'}
          </p>
        </>
      )}
    </>
  );
}

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
  const focusOn = useStore((s) => s.focusOn);
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

      <MotionPathControls element={el} />

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
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="justify-center"
            onClick={() => focusOn(el.id)}
            title="Bring the canvas to where the camera will be while this element draws"
          >
            <Crosshair size={13} /> Go to shot
          </Button>
          <Button
            variant="secondary"
            className="justify-center"
            onClick={() => patch({ camera: 'custom', customCamera: viewFromRect(cameraBoundary, project) })}
            title="Record the dashed boundary on the canvas as the camera shot for this element"
          >
            <Camera size={13} /> Set from boundary
          </Button>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-t3">
        {el.camera === 'previous'
          ? 'Stays: the camera keeps the previous shot for this element. To start a new shot here, pan or zoom the canvas until the dashed boundary frames what you want, then press Set from boundary.'
          : el.camera === 'custom'
            ? 'This element starts a new shot (the teal outline on the canvas when it differs from the boundary). To change it: Go to shot, pan or zoom the canvas, then Set from boundary.'
            : el.camera === 'whole'
              ? 'The camera pulls back to show every element.'
              : el.camera === 'scene'
                ? 'The camera frames everything in this scene.'
                : 'The camera zooms in on this element by itself.'}
      </p>
    </div>
  );
}
