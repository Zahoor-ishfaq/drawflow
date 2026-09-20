import { useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Upload } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { allFonts, CUSTOM_FONT_PREFIX, readFontFile, type TextOptions } from '../../lib/textToPaths';
import { Field } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Slider } from '../ui/Slider';

export interface TextSettings extends Omit<TextOptions, 'customFonts'> {
  fontId: string;
  fontSize: number;
}

/** Font, size, weight, style, alignment and spacing — shared by the text panel and inspector. */
export function TextControls({ value, onChange }: { value: TextSettings; onChange: (v: TextSettings) => void }) {
  const customFonts = useStore((s) => s.project.fonts ?? []);
  const updateProject = useStore((s) => s.updateProject);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const set = (patch: Partial<TextSettings>) => onChange({ ...value, ...patch });

  const onFontFile = async (file: File | undefined) => {
    if (!file) return;
    setFontError(null);
    try {
      const font = await readFontFile(file);
      updateProject({ fonts: [...customFonts, font] });
      set({ fontId: `${CUSTOM_FONT_PREFIX}${font.id}` });
    } catch (e) {
      setFontError(e instanceof Error ? `Could not read that font (${e.message}). TTF and OTF files work; WOFF2 does not.` : 'Could not read that font.');
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1fr_70px] gap-2">
        <Field label="Font">
          <select className="df-input" value={value.fontId} onChange={(e) => set({ fontId: e.target.value })}>
            {allFonts(customFonts).map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <input
            type="number"
            className="df-input"
            min={12}
            max={600}
            value={value.fontSize}
            onChange={(e) => set({ fontSize: parseInt(e.target.value, 10) || value.fontSize })}
          />
        </Field>
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton label="Bold" active={!!value.bold} onClick={() => set({ bold: !value.bold })} className="!h-7 !w-7"><Bold size={14} /></IconButton>
        <IconButton label="Italic" active={!!value.italic} onClick={() => set({ italic: !value.italic })} className="!h-7 !w-7"><Italic size={14} /></IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <IconButton label="Align left" active={(value.align ?? 'left') === 'left' && !value.rtl} onClick={() => set({ align: 'left' })} className="!h-7 !w-7"><AlignLeft size={14} /></IconButton>
        <IconButton label="Align centre" active={value.align === 'center'} onClick={() => set({ align: 'center' })} className="!h-7 !w-7"><AlignCenter size={14} /></IconButton>
        <IconButton label="Align right" active={value.align === 'right' || (!value.align && !!value.rtl)} onClick={() => set({ align: 'right' })} className="!h-7 !w-7"><AlignRight size={14} /></IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          className={'h-7 rounded-lg px-2 text-[11.5px] font-medium ' + (value.rtl ? 'bg-accent-weak text-accent' : 'text-t2 hover:bg-hov hover:text-t1')}
          title="Right-to-left text (Hebrew and similar; Arabic letters are not joined)"
          onClick={() => set({ rtl: !value.rtl })}
        >
          RTL
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] text-t2 hover:bg-hov hover:text-t1"
          title="Add a TTF/OTF font of your own (for other languages or styles); it is saved with the project"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Font…
        </button>
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,font/ttf,font/otf" className="hidden" onChange={(e) => { void onFontFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {fontError && <div className="text-[11.5px] text-red-500">{fontError}</div>}
      {value.rtl && (
        <div className="text-[11px] leading-relaxed text-t3">
          The bundled fonts only cover Latin letters — characters they lack show as boxes. Add a font
          that has them (e.g. a Noto font for your script) with “Font…”.
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Line spacing">
          <Slider value={value.lineHeight ?? 1.25} onChange={(v) => set({ lineHeight: v })} min={0.8} max={2.5} step={0.05} precision={2} withInput={false} />
        </Field>
        <Field label="Letter spacing">
          <Slider value={value.letterSpacing ?? 0} onChange={(v) => set({ letterSpacing: v })} min={-0.05} max={0.5} step={0.01} precision={2} withInput={false} />
        </Field>
      </div>
    </div>
  );
}
