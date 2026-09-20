import { useRef, useState } from 'react';
import { Check, Trash2, Upload } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { CustomHand, HandStyle } from '../../types';
import { allHands, CUSTOM_PREFIX } from '../../assets/hands';
import { loadRasterImage } from '../../lib/images';
import { Field, SectionHeader } from '../ui/Field';
import { Slider } from '../ui/Slider';
import { Button } from '../ui/Button';

interface HandPickerProps {
  value: HandStyle | undefined;   // undefined = "use project default" (element override mode)
  onChange: (v: HandStyle | undefined) => void;
  allowDefault?: boolean;
  compact?: boolean;
}

/** Grid of hand thumbnails; shared by the project panel and the element inspector. */
export function HandPicker({ value, onChange, allowDefault = false, compact = false }: HandPickerProps) {
  const project = useStore((s) => s.project);
  const hands = allHands(project);
  const options: { id: HandStyle | undefined; label: string; src?: string; sub?: string; custom?: boolean }[] = [
    ...(allowDefault
      ? [{ id: undefined, label: 'Project default', sub: hands.find((h) => h.id === project.hand)?.label ?? 'No hand' }]
      : []),
    ...hands.map((h) => ({ id: h.id as HandStyle, label: h.label, src: h.src, sub: h.description, custom: h.id.startsWith(CUSTOM_PREFIX) })),
    { id: 'none' as HandStyle, label: 'No hand', sub: 'Lines draw themselves' },
  ];

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id ?? 'default'}
            type="button"
            className={
              'df-ui-anim relative flex flex-col items-center gap-1.5 rounded-xl border-2 bg-white p-2 text-left transition-colors ' +
              (active ? 'border-accent' : 'border-line hover:border-[#b9c2cf]')
            }
            onClick={() => onChange(opt.id)}
            title={opt.sub}
          >
            <div
              className={`flex w-full items-center justify-center overflow-hidden rounded-lg bg-[#f4f6f9] ${compact ? 'h-14' : 'h-20'}`}
            >
              {opt.src ? (
                <img src={opt.src} alt="" className={opt.custom ? 'h-full w-auto max-w-none object-contain' : 'h-[140%] w-auto max-w-none translate-x-[8%] translate-y-[22%] object-contain'} draggable={false} />
              ) : (
                <span className="text-[11px] text-t3">{opt.id === 'none' ? '—' : 'auto'}</span>
              )}
            </div>
            <span className={`w-full truncate text-center text-[11.5px] ${active ? 'font-semibold text-t1' : 'text-t2'}`}>
              {opt.label}
            </span>
            {active && (
              <span className="absolute top-1.5 right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-white">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Upload a hand photo (transparent PNG/WebP) and click where the pen tip is. */
function CustomHandEditor({ onDone }: { onDone: () => void }) {
  const updateProject = useStore((s) => s.updateProject);
  const customHands = useStore((s) => s.project.customHands ?? []);
  const [img, setImg] = useState<{ src: string; width: number; height: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [name, setName] = useState('My hand');
  const [size, setSize] = useState(0.7);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const loaded = await loadRasterImage(file);
    setImg(loaded);
    setTip(null);
    setName(file.name.replace(/\.[^.]+$/, ''));
  };

  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = imgRef.current;
    if (!el || !img) return;
    const r = el.getBoundingClientRect();
    setTip({ x: ((e.clientX - r.left) / r.width) * img.width, y: ((e.clientY - r.top) / r.height) * img.height });
  };

  const save = () => {
    if (!img || !tip) return;
    const hand: CustomHand = { id: crypto.randomUUID(), name: name.trim() || 'My hand', src: img.src, width: img.width, height: img.height, tipX: tip.x, tipY: tip.y, frameFraction: size };
    updateProject({ customHands: [...customHands, hand], hand: `${CUSTOM_PREFIX}${hand.id}` });
    onDone();
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel2 p-3">
      {!img ? (
        <button type="button" className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line text-[12px] text-t3 hover:border-accent hover:text-accent" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Choose a hand photo (PNG or WebP with a transparent background)
        </button>
      ) : (
        <>
          <p className="text-[11.5px] text-t2">Click exactly where the pen touches the paper.</p>
          <div className="relative self-center" style={{ maxWidth: '100%' }}>
            <img ref={imgRef} src={img.src} alt="" className="max-h-[220px] w-auto cursor-crosshair rounded-lg bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]" onClick={pick} draggable={false} />
            {tip && (
              <span
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
                style={{ left: `${(tip.x / img.width) * 100}%`, top: `${(tip.y / img.height) * 100}%` }}
              />
            )}
          </div>
          <Field label="Name">
            <input className="df-input !h-7 text-[12px]" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Size on screen (fraction of the frame height)">
            <Slider value={size} onChange={setSize} min={0.3} max={1.2} step={0.05} precision={2} />
          </Field>
          <div className="flex justify-end gap-1.5">
            <Button onClick={onDone}>Cancel</Button>
            <Button variant="primary" disabled={!tip} onClick={save}>Use this hand</Button>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

/** Project-level "Set hand" panel. */
export function HandPanel() {
  const project = useStore((s) => s.project);
  const updateProject = useStore((s) => s.updateProject);
  const [adding, setAdding] = useState(false);
  const customHands = project.customHands ?? [];
  const offset = project.handOffset ?? { x: 0, y: 0 };

  const removeCustom = (id: string) => {
    const next = customHands.filter((h) => h.id !== id);
    updateProject({ customHands: next, hand: project.hand === `${CUSTOM_PREFIX}${id}` ? 'marker' : project.hand });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <HandPicker value={project.hand} onChange={(v) => updateProject({ hand: v ?? 'marker' })} />
      {customHands.length > 0 && (
        <div className="flex flex-col gap-1">
          {customHands.map((h) => (
            <div key={h.id} className="flex items-center gap-2 text-[12px] text-t2">
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <button type="button" className="flex h-6 w-6 items-center justify-center rounded-md text-t3 hover:bg-red-50 hover:text-red-500" title={`Remove "${h.name}"`} onClick={() => removeCustom(h.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <CustomHandEditor onDone={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" className="justify-center" onClick={() => setAdding(true)}>
          <Upload size={13} /> Add your own hand…
        </Button>
      )}
      <p className="text-[11.5px] leading-relaxed text-t3">
        This hand draws every element unless you pick a different one for a specific
        element in its Animation settings.
      </p>

      <SectionHeader>Movement</SectionHeader>
      <Field label="Smoothing — 0 sits exactly on the stroke, higher glides">
        <Slider value={project.handSmoothing ?? 0} onChange={(v) => updateProject({ handSmoothing: v })} min={0} max={1} step={0.05} precision={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Offset →">
          <Slider value={offset.x} onChange={(v) => updateProject({ handOffset: { ...offset, x: v } })} min={-0.15} max={0.15} step={0.005} precision={3} withInput={false} />
        </Field>
        <Field label="Offset ↓">
          <Slider value={offset.y} onChange={(v) => updateProject({ handOffset: { ...offset, y: v } })} min={-0.15} max={0.15} step={0.005} precision={3} withInput={false} />
        </Field>
      </div>
      <p className="text-[11px] leading-relaxed text-t3">
        Offset nudges the hand picture relative to the pen tip (as a fraction of its height) when a
        custom photo's tip is slightly off.
      </p>
    </div>
  );
}
