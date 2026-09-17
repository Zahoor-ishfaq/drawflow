import { useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useSelectedElement, useSequence } from '../../store/selectors';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Segmented';
import { TransformSection } from '../inspector/TransformSection';
import { StyleSection } from '../inspector/StyleSection';
import { AnimationSection } from '../inspector/AnimationSection';
import { TextSection } from '../inspector/TextSection';
import { ProjectSection } from '../inspector/ProjectSection';
import { AudioSection } from '../inspector/AudioSection';
import { selectedClipId } from '../timeline/AudioLane';

type Tab = 'style' | 'animation';

export function Inspector() {
  const selected = useSelectedElement();
  const sequence = useSequence();
  const selectedClip = useStore((s) => {
    const id = selectedClipId(s.selectedId);
    return id ? s.audioClips.find((c) => c.id === id) ?? null : null;
  });
  const { duplicateElement, removeElement, reorder } = useStore.getState();
  const [tab, setTab] = useState<Tab>('animation');

  const index = selected ? sequence.findIndex((e) => e.id === selected.id) : -1;

  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3.5">
        <span className="truncate text-[14px] font-semibold">
          {selected ? `${index + 1}. ${selected.label}` : selectedClip ? selectedClip.name : 'Project settings'}
        </span>
        {selected && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label="Play earlier"
              disabled={index <= 0}
              onClick={() => reorder(selected.id, index - 1)}
            >
              <ArrowLeft size={14} />
            </IconButton>
            <IconButton
              label="Play later"
              disabled={index >= sequence.length - 1}
              onClick={() => reorder(selected.id, index + 1)}
            >
              <ArrowRight size={14} />
            </IconButton>
            <IconButton label="Duplicate (Ctrl+D)" onClick={() => duplicateElement(selected.id)}>
              <Copy size={14} />
            </IconButton>
            <IconButton
              label="Delete (Del)"
              className="hover:!bg-red-50 hover:!text-red-500"
              onClick={() => removeElement(selected.id)}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        )}
      </div>

      {selected && (
        <div className="shrink-0 px-3.5 pt-3">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'animation', label: 'Animation' },
              { value: 'style', label: 'Style' },
            ]}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3.5">
        {selected ? (
          tab === 'animation' ? (
            <AnimationSection element={selected} />
          ) : (
            <div className="flex flex-col">
              <TransformSection element={selected} />
              <StyleSection element={selected} />
              {selected.kind === 'text' && <TextSection element={selected} />}
            </div>
          )
        ) : selectedClip ? (
          <AudioSection clip={selectedClip} />
        ) : (
          <ProjectSection />
        )}
      </div>
    </aside>
  );
}
