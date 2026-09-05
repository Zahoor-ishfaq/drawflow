import type { DrawElement } from '../../types';
import { useStore } from '../../store/useStore';
import { SectionHeader } from '../ui/Field';
import { NumberInput } from '../ui/NumberInput';

export function TransformSection({ element: el }: { element: DrawElement }) {
  const updateElement = useStore((s) => s.updateElement);
  const patch = (p: Partial<DrawElement>) => updateElement(el.id, p);

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
    </div>
  );
}
