import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useSelectedElement } from '../../store/selectors';
import { IconButton } from '../ui/IconButton';
import { TransformSection } from '../inspector/TransformSection';
import { StyleSection } from '../inspector/StyleSection';
import { AnimationSection } from '../inspector/AnimationSection';
import { TextSection } from '../inspector/TextSection';
import { ProjectSection } from '../inspector/ProjectSection';

export function Inspector() {
  const selected = useSelectedElement();
  const { duplicateElement, removeElement, reorder } = useStore.getState();
  const elementCount = useStore((s) => s.elements.length);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[14px] font-medium">
          {selected ? selected.label : 'Project'}
        </span>
        {selected && (
          <div className="flex items-center gap-0.5">
            <IconButton label="Duplicate (Ctrl+D)" onClick={() => duplicateElement(selected.id)}>
              <Copy size={14} />
            </IconButton>
            <IconButton
              label="Bring forward"
              disabled={selected.zIndex >= elementCount - 1}
              onClick={() => reorder(selected.id, selected.zIndex + 1)}
            >
              <ChevronUp size={14} />
            </IconButton>
            <IconButton
              label="Send back"
              disabled={selected.zIndex <= 0}
              onClick={() => reorder(selected.id, selected.zIndex - 1)}
            >
              <ChevronDown size={14} />
            </IconButton>
            <IconButton label="Delete (Del)" onClick={() => removeElement(selected.id)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selected ? (
          <div className="flex flex-col">
            <TransformSection element={selected} />
            <StyleSection element={selected} />
            <AnimationSection element={selected} />
            {selected.kind === 'text' && <TextSection element={selected} />}
          </div>
        ) : (
          <ProjectSection />
        )}
      </div>
    </aside>
  );
}
