import { useStore } from '../../store/useStore';
import type { CameraEasing } from '../../types';
import { Field, SectionHeader } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';

const SIZE_PRESETS = [
  { label: '16:9 · 1920 × 1080 (YouTube)', width: 1920, height: 1080 },
  { label: '9:16 · 1080 × 1920 (Stories)', width: 1080, height: 1920 },
  { label: '1:1 · 1080 × 1080 (Square)', width: 1080, height: 1080 },
];

export function ProjectSection() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);

  const presetIdx = SIZE_PRESETS.findIndex(
    (p) => p.width === project.width && p.height === project.height,
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Project</SectionHeader>
      <Field label="Name">
        <input
          type="text"
          className="df-input"
          value={project.name}
          onChange={(e) => updateProject({ name: e.target.value })}
        />
      </Field>
      <Field label="Video size">
        <select
          className="df-input"
          value={presetIdx === -1 ? 0 : presetIdx}
          onChange={(e) => {
            const p = SIZE_PRESETS[parseInt(e.target.value, 10)];
            updateProject({ width: p.width, height: p.height });
          }}
        >
          {SIZE_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>{p.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Frame rate">
        <select
          className="df-input"
          value={project.fps}
          onChange={(e) => updateProject({ fps: parseInt(e.target.value, 10) })}
        >
          <option value={24}>24 fps</option>
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </Field>

      <SectionHeader>Camera</SectionHeader>
      <Field label="Camera movement">
        <Segmented<CameraEasing>
          value={project.cameraEasing}
          onChange={(v) => updateProject({ cameraEasing: v })}
          options={[
            { value: 'easeOut', label: 'Ease out' },
            { value: 'linear', label: 'Linear' },
            { value: 'cut', label: 'Cut' },
          ]}
        />
      </Field>
      <label className="flex items-center justify-between">
        <span className="text-[12px] text-t2">Zoom out to the whole scribe at the end</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#0d9d97]"
          checked={project.zoomAtEnd}
          onChange={(e) => updateProject({ zoomAtEnd: e.target.checked })}
        />
      </label>
      <Field label="Hold final frame (seconds)">
        <Slider value={project.endHold} onChange={(v) => updateProject({ endHold: v })} min={0} max={10} step={0.5} />
      </Field>

      <p className="pt-1 text-[11.5px] leading-relaxed text-t3">
        Paper and the drawing hand are set from the toolbar on the left. Click an element
        on the canvas or in the strip below to edit it.
      </p>
    </div>
  );
}
