import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { BackgroundImage } from '../../types';
import { loadRasterImage, isRasterFile } from '../../lib/images';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';

/** Background pictures are kept sharp enough for a 1440p video. */
const BACKGROUND_SIDE = 2560;

/**
 * Choose, fit and fade a picture that fills the video frame behind
 * everything. Used for the whole video (Paper panel) and for one scene.
 */
export function BackgroundPicture({ value, onChange, note }: {
  value: BackgroundImage | undefined;
  onChange: (v: BackgroundImage | undefined) => void;
  /** what shows when there is none (e.g. the whole video's picture) */
  note?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!isRasterFile(file)) { setError('Choose a picture (PNG, JPG, WebP).'); return; }
    setBusy(true);
    try {
      const img = await loadRasterImage(file, file.type, BACKGROUND_SIDE);
      onChange({ src: img.src, width: img.width, height: img.height, opacity: value?.opacity ?? 1, fit: value?.fit ?? 'cover' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="block text-[12px] text-t2">Background picture</span>
      {value ? (
        <>
          <div className="flex items-center gap-2">
            <img src={value.src} alt="" className="h-12 w-20 shrink-0 rounded-md border border-line object-cover" />
            <div className="flex flex-1 flex-col gap-1">
              <button type="button" className="flex h-7 items-center justify-center gap-1.5 rounded-full border border-line text-[11.5px] text-t1 hover:bg-hov" onClick={() => input.current?.click()}>
                <ImagePlus size={12} /> {busy ? 'Reading…' : 'Change picture…'}
              </button>
              <button type="button" className="flex h-7 items-center justify-center gap-1.5 rounded-full border border-line text-[11.5px] text-t1 hover:bg-hov" onClick={() => onChange(undefined)}>
                <Trash2 size={12} /> Remove picture
              </button>
            </div>
          </div>
          <Segmented<'cover' | 'contain'>
            value={value.fit ?? 'cover'}
            onChange={(fit) => onChange({ ...value, fit })}
            options={[{ value: 'cover', label: 'Fill the frame' }, { value: 'contain', label: 'Whole picture' }]}
          />
          <div>
            <span className="mb-1 block text-[12px] text-t2">Strength (lower it so drawings stand out)</span>
            <Slider value={value.opacity ?? 1} onChange={(opacity) => onChange({ ...value, opacity })} min={0.1} max={1} step={0.05} precision={2} />
          </div>
        </>
      ) : (
        <button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-dashed border-line text-[12px] text-t2 hover:border-accent hover:text-accent" onClick={() => input.current?.click()}>
          <ImagePlus size={13} /> {busy ? 'Reading…' : 'Choose a picture…'}
        </button>
      )}
      <p className="text-[11px] leading-relaxed text-t3">
        {value ? 'It fills the video frame behind your drawings. Camera view shows it as the video will.' : note ?? 'A photo or illustration that fills the video frame behind your drawings.'}
      </p>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
