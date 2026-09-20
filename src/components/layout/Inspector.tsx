import { useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { ArrowLeft, ArrowRight, ClipboardCopy, ClipboardPaste, Copy, Eye, EyeOff, Group, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useSelectedElement, useSequence } from '../../store/selectors';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { Field, SectionHeader } from '../ui/Field';
import { TransformSection, AlignRow } from '../inspector/TransformSection';
import { StyleSection } from '../inspector/StyleSection';
import { AnimationSection } from '../inspector/AnimationSection';
import { TextSection } from '../inspector/TextSection';
import { ProjectSection } from '../inspector/ProjectSection';
import { AudioSection } from '../inspector/AudioSection';
import { selectedClipId } from '../timeline/AudioLane';

type Tab = 'style' | 'animation';

function MultiSelection({ ids }: { ids: string[] }) {
  const s = useStore.getState();
  const elements = useStore((st) => st.elements);
  const project = useStore((st) => st.project);
  const els = elements.filter((e) => ids.includes(e.id));
  const anyLocked = els.some((e) => e.locked);
  const anyHidden = els.some((e) => e.hidden);
  const vectors = els.filter((e) => e.kind !== 'image').length;
  const canPasteAnimation = useStore((st) => st.canPasteAnimation);
  const scenes = project.scenes ?? [];

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Arrange</SectionHeader>
      <AlignRow ids={ids} withDistribute={ids.length >= 3} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" disabled={vectors < 2} onClick={() => s.group(ids)} title="Merge into one element (Ctrl+G)">
          <Group size={13} /> Group
        </Button>
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => s.updateElements(ids, { locked: !anyLocked })}>
          {anyLocked ? <LockOpen size={13} /> : <Lock size={13} />} {anyLocked ? 'Unlock' : 'Lock'}
        </Button>
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => s.updateElements(ids, { hidden: !anyHidden })}>
          {anyHidden ? <Eye size={13} /> : <EyeOff size={13} />} {anyHidden ? 'Show' : 'Hide'}
        </Button>
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => s.setLayer(ids, 'front')}>To front</Button>
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => s.setLayer(ids, 'back')}>To back</Button>
      </div>

      <SectionHeader>Animation</SectionHeader>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" disabled={!canPasteAnimation} onClick={() => s.pasteAnimation(ids)} title="Apply the copied animation settings to every selected element (Ctrl+Shift+V)">
          <ClipboardPaste size={13} /> Paste animation to all
        </Button>
        <Button variant="secondary" className="!h-7 !px-2.5 text-[12px]" onClick={() => s.updateElements(ids, (el) => ({ withPrevious: !el.withPrevious }))} title="Draw all of these at the same time">
          Draw together
        </Button>
      </div>
      {scenes.length > 0 && (
        <Field label="Move to scene">
          <select className="df-input" value="" onChange={(e) => { if (e.target.value) s.assignScene(ids, e.target.value); }}>
            <option value="">Choose a scene…</option>
            {scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        </Field>
      )}
      <p className="text-[11px] leading-relaxed text-t3">
        Shift-click adds to the selection; Shift-drag on the paper draws a selection box. Arrow keys nudge.
      </p>
    </div>
  );
}

export function Inspector() {
  const selected = useSelectedElement();
  const selectedIds = useStore((s) => s.selectedIds);
  const canPasteAnimation = useStore((s) => s.canPasteAnimation);
  const sequence = useSequence();
  const selectedClip = useStore((s) => {
    const id = selectedClipId(s.selectedId);
    return id ? s.audioClips.find((c) => c.id === id) ?? null : null;
  });
  const { duplicateElement, removeElement, removeElements, reorder, copyAnimation, pasteAnimation } = useStore.getState();
  const [tab, setTab] = useState<Tab>('animation');
  const width = useUiStore((s) => s.inspectorWidth);
  const setUi = useUiStore((s) => s.set);
  const resize = useRef<{ x: number; w: number } | null>(null);

  const multi = selectedIds.length > 1;
  const index = selected ? sequence.findIndex((e) => e.id === selected.id) : -1;

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-line bg-panel" style={{ width }}>
      <div
        className="absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize hover:bg-accent/30"
        title="Drag to resize"
        onPointerDown={(e) => { resize.current = { x: e.clientX, w: width }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const r = resize.current; if (r) setUi({ inspectorWidth: Math.max(240, Math.min(520, r.w - (e.clientX - r.x))) }); }}
        onPointerUp={() => { resize.current = null; }}
        onPointerCancel={() => { resize.current = null; }}
      />
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3.5">
        <span className="truncate text-[14px] font-semibold">
          {multi ? `${selectedIds.length} elements` : selected ? `${index + 1}. ${selected.label}` : selectedClip ? selectedClip.name : 'Project settings'}
        </span>
        {multi ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Duplicate (Ctrl+D)" onClick={() => useStore.getState().duplicateElements(selectedIds)}>
              <Copy size={14} />
            </IconButton>
            <IconButton label="Delete (Del)" className="hover:!bg-red-50 hover:!text-red-500" onClick={() => removeElements(selectedIds)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ) : selected && (
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
            <IconButton label="Copy animation settings (Ctrl+Shift+C)" onClick={() => copyAnimation(selected.id)}>
              <ClipboardCopy size={14} />
            </IconButton>
            <IconButton label="Paste animation settings (Ctrl+Shift+V)" disabled={!canPasteAnimation} onClick={() => pasteAnimation([selected.id])}>
              <ClipboardPaste size={14} />
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

      {selected && !multi && (
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
        {multi ? (
          <MultiSelection ids={selectedIds} />
        ) : selected ? (
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
