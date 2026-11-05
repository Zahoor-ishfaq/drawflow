import { useRef, useState } from 'react';
import { FileDown, FileUp, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { importSubtitles } from '../../lib/automation';
import { saveSrt, subtitleCues, subtitleSettings } from '../../lib/subtitles';
import { SUBTITLE_FONTS } from '../../lib/subtitleSprite';
import { Field } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { Segmented } from '../ui/Segmented';
import { ColorInput } from '../ui/ColorInput';
import { Button } from '../ui/Button';
import type { SubtitlePosition, SubtitleSettings } from '../../types';

const POSITIONS: { value: SubtitlePosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
];

/** Words on screen, timed to the voice: how they look, and .srt files in and out. */
export function SubtitlesPanel() {
  const project = useStore((s) => s.project);
  const clips = useStore((s) => s.audioClips);
  const updateProject = useStore((s) => s.updateProject);
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = subtitleSettings(project);
  const cues = subtitleCues(project, clips);
  const imported = !!settings.cues?.length;
  const patch = (p: Partial<SubtitleSettings>) => updateProject({ subtitles: { ...settings, ...p } });
  const fonts = [...new Set([...SUBTITLE_FONTS, ...(project.fonts ?? []).map((f) => f.name), settings.font])];

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      importSubtitles(await f.arrayBuffer());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex items-center gap-2 text-[12.5px] font-medium">
        <input type="checkbox" checked={settings.show} onChange={(e) => patch({ show: e.target.checked })} />
        Show subtitles in the video
      </label>
      <p className="text-[11.5px] leading-relaxed text-t3">
        {cues.length > 0
          ? `${cues.length} line${cues.length === 1 ? '' : 's'}${imported ? ' from your .srt file.' : ', timed to the voice.'}`
          : 'No subtitles yet. AI voices add them by themselves. For a recording or an audio file, select its clip on the timeline and fill in the words spoken. Or import an .srt file.'}
      </p>

      <Field label="Font">
        <select className="df-input" value={settings.font} onChange={(e) => patch({ font: e.target.value })}>
          {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Size">
        <Slider value={settings.size} onChange={(v) => patch({ size: v })} min={20} max={120} step={1} precision={0} />
      </Field>
      <div>
        <span className="mb-1 block text-[12px] text-t2">Position</span>
        <Segmented<SubtitlePosition> value={settings.position} onChange={(position) => patch({ position })} options={POSITIONS} />
      </div>
      <Field label="Text colour">
        <ColorInput value={settings.color} onChange={(color) => patch({ color })} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={settings.box} onChange={(e) => patch({ box: e.target.checked })} />
        Dark band behind the words
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-center" onClick={() => file.current?.click()}
          title="Use a subtitle file for the whole video, in place of the voice's own words">
          <FileUp size={13} /> Import .srt
        </Button>
        <Button variant="secondary" className="justify-center" disabled={cues.length === 0} onClick={() => saveSrt(project.name, cues)}
          title="Save the subtitles as a file, for YouTube or to edit in Notepad and import again">
          <FileDown size={13} /> Save .srt
        </Button>
      </div>
      {imported && (
        <Button variant="secondary" className="justify-center" onClick={() => patch({ cues: undefined })}
          title="Go back to the subtitles made from the voice">
          <Trash2 size={13} /> Remove the imported file
        </Button>
      )}
      <input
        ref={file} type="file" accept=".srt,.vtt" className="hidden"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      {error && <p className="text-[11.5px] text-red-500">{error}</p>}
    </div>
  );
}
