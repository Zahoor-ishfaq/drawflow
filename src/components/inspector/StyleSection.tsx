import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { Field, SectionHeader } from '../ui/Field';
import { ColorInput } from '../ui/ColorInput';
import { Slider } from '../ui/Slider';

export function StyleSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);

  if (el.kind === 'image') {
    return (
      <div className="flex flex-col gap-2.5">
        <SectionHeader>Picture</SectionHeader>
        <p className="text-[11.5px] leading-relaxed text-t3">
          {el.image ? `${el.image.width} × ${el.image.height} px. ` : ''}
          Resize it with the corner handles on the canvas, or the scale value above.
        </p>
      </div>
    );
  }

  const hasOwnColors = !!el.pathFills;

  return (
    <div className="flex flex-col gap-2.5">
      <SectionHeader>Style</SectionHeader>
      {hasOwnColors ? (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-t2">Artwork keeps its own colours</span>
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => patch({ pathFills: undefined, pathStrokes: undefined, fillColor: 'none' })}
          >
            Use one colour
          </button>
        </div>
      ) : (
        <>
          <Field label="Stroke color">
            <ColorInput value={el.strokeColor} onChange={(v) => patch({ strokeColor: v })} />
          </Field>
          <Field label="Fill color">
            <ColorInput value={el.fillColor} onChange={(v) => patch({ fillColor: v })} allowNone />
          </Field>
        </>
      )}
      <Field label="Stroke width">
        <Slider
          value={el.strokeWidth}
          onChange={(v) => patch({ strokeWidth: v })}
          min={0.5} max={30} step={0.5}
        />
      </Field>
      <label className="flex items-center justify-between">
        <span className="text-[12px] text-t2">Fill after drawing</span>
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[#4f8cff]"
          checked={el.fillAfterDraw}
          onChange={(e) => patch({ fillAfterDraw: e.target.checked })}
        />
      </label>
    </div>
  );
}
