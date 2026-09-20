import { useRef } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, BringToFront, ChevronDown, ChevronUp, Eye, EyeOff,
  FlipHorizontal2, FlipVertical2, ImageUp, Lock, LockOpen, SendToBack, Ungroup,
} from 'lucide-react';
import type { DrawElement } from '../../types';
import { useStore, type AlignMode } from '../../store/useStore';
import { Field, SectionHeader } from '../ui/Field';
import { NumberInput } from '../ui/NumberInput';
import { Slider } from '../ui/Slider';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { loadRasterImage } from '../../lib/images';
import { scribblePath } from '../../lib/scribble';

const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
  { mode: 'hcenter', label: 'Align centre', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { mode: 'vcenter', label: 'Align middle', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

/** Alignment row shared by the single- and multi-selection inspectors. */
export function AlignRow({ ids, withDistribute }: { ids: string[]; withDistribute?: boolean }) {
  const align = useStore((s) => s.align);
  const distribute = useStore((s) => s.distribute);
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {ALIGN.map(({ mode, label, Icon }) => (
        <IconButton key={mode} label={label} onClick={() => align(ids, mode)} className="!h-7 !w-7">
          <Icon size={14} />
        </IconButton>
      ))}
      {withDistribute && (
        <>
          <span className="mx-1 h-4 w-px bg-line" />
          <Button className="!h-7 !px-2 text-[11.5px]" onClick={() => distribute(ids, 'h')} title="Even horizontal spacing">
            Spread ↔
          </Button>
          <Button className="!h-7 !px-2 text-[11.5px]" onClick={() => distribute(ids, 'v')} title="Even vertical spacing">
            Spread ↕
          </Button>
        </>
      )}
    </div>
  );
}

export function TransformSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const setLayer = useStore((s) => s.setLayer);
  const ungroup = useStore((s) => s.ungroup);
  const replaceImage = useStore((s) => s.replaceImage);
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);
  const fileRef = useRef<HTMLInputElement>(null);
  const crop = el.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };

  const onReplace = async (file: File | undefined) => {
    if (!file) return;
    const img = await loadRasterImage(file);
    replaceImage(el.id, img, [scribblePath(img.width, img.height)]);
  };

  return (
    <div>
      <SectionHeader>Transform</SectionHeader>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="X" value={el.x} onChange={(v) => patch({ x: v })} step={1} />
        <NumberInput label="Y" value={el.y} onChange={(v) => patch({ y: v })} step={1} />
        <NumberInput
          label="S" value={el.scale} onChange={(v) => patch({ scale: v })}
          min={0.02} max={50} step={0.01} precision={2}
        />
        <NumberInput
          label="R" value={el.rotation} onChange={(v) => patch({ rotation: v })}
          min={-360} max={360} step={1}
        />
      </div>
      <div className="mt-2 flex items-center gap-0.5">
        <IconButton label="Flip horizontally" active={!!el.flipX} onClick={() => patch({ flipX: !el.flipX })} className="!h-7 !w-7">
          <FlipHorizontal2 size={14} />
        </IconButton>
        <IconButton label="Flip vertically" active={!!el.flipY} onClick={() => patch({ flipY: !el.flipY })} className="!h-7 !w-7">
          <FlipVertical2 size={14} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <IconButton label={el.locked ? 'Unlock (Ctrl+L)' : 'Lock position (Ctrl+L)'} active={!!el.locked} onClick={() => patch({ locked: !el.locked })} className="!h-7 !w-7">
          {el.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </IconButton>
        <IconButton label={el.hidden ? 'Show (Ctrl+Shift+H)' : 'Hide from the video (Ctrl+Shift+H)'} active={!!el.hidden} onClick={() => patch({ hidden: !el.hidden })} className="!h-7 !w-7">
          {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
        {el.groupChildren?.length ? (
          <>
            <span className="mx-1 h-4 w-px bg-line" />
            <Button className="!h-7 !px-2 text-[11.5px]" onClick={() => ungroup(el.id)} title="Ungroup (Ctrl+Shift+G)">
              <Ungroup size={13} /> Ungroup
            </Button>
          </>
        ) : null}
      </div>

      <div className="mt-3">
        <Field label="Opacity">
          <Slider value={el.opacity ?? 1} onChange={(v) => patch({ opacity: v })} min={0} max={1} step={0.01} precision={2} />
        </Field>
      </div>

      <SectionHeader>Arrange</SectionHeader>
      <div className="mb-1 text-[11px] text-t3">Align to the video frame</div>
      <AlignRow ids={[el.id]} />
      <div className="mt-2 mb-1 text-[11px] text-t3">Stacking</div>
      <div className="flex items-center gap-0.5">
        <IconButton label="Send to back (Ctrl+[)" onClick={() => setLayer([el.id], 'back')} className="!h-7 !w-7">
          <SendToBack size={14} />
        </IconButton>
        <IconButton label="Send backward ([)" onClick={() => setLayer([el.id], 'backward')} className="!h-7 !w-7">
          <ChevronDown size={14} />
        </IconButton>
        <IconButton label="Bring forward (])" onClick={() => setLayer([el.id], 'forward')} className="!h-7 !w-7">
          <ChevronUp size={14} />
        </IconButton>
        <IconButton label="Bring to front (Ctrl+])" onClick={() => setLayer([el.id], 'front')} className="!h-7 !w-7">
          <BringToFront size={14} />
        </IconButton>
        {(el.layer ?? 0) !== 0 && (
          <span className="ml-1 text-[11px] text-t3">layer {el.layer! > 0 ? '+' : ''}{el.layer}</span>
        )}
      </div>

      {el.kind === 'image' && el.image && (
        <>
          <SectionHeader>Image</SectionHeader>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <Field key={side} label={`Crop ${side}`}>
                <Slider
                  value={crop[side]}
                  onChange={(v) => {
                    const next = { ...crop, [side]: v };
                    // never crop an image away entirely
                    if (next.left + next.right > 0.9 || next.top + next.bottom > 0.9) return;
                    patch({ crop: next });
                  }}
                  min={0} max={0.9} step={0.01} precision={2} withInput={false}
                />
              </Field>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => fileRef.current?.click()}>
              <ImageUp size={13} /> Replace image…
            </Button>
            {el.crop && (
              <Button className="!h-7 !px-2 text-[12px]" onClick={() => patch({ crop: undefined })}>Reset crop</Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { void onReplace(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
        </>
      )}
    </div>
  );
}
