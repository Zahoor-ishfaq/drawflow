import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash2, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { PAPERS } from '../../assets/paper';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { IconButton } from '../ui/IconButton';
import type { PaperStyle, Scene, SceneTransition } from '../../types';

/** Scene settings dialog: name, transition, paper, order, duplicate, delete. */
export function SceneEditor({ scene, index, count, onClose }: { scene: Scene; index: number; count: number; onClose: () => void }) {
  const { updateScene, removeScene, duplicateScene, moveScene, updateElements, selectMany } = useStore.getState();
  const elements = useStore((s) => s.elements);
  const live = useStore((s) => (s.project.scenes ?? []).find((x) => x.id === scene.id)) ?? scene;
  const [confirm, setConfirm] = useState(false);
  const members = elements.filter((e) => e.sceneId === scene.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101623]/45" onMouseDown={onClose}>
      <div className="flex w-[360px] flex-col gap-3 rounded-2xl border border-line bg-panel p-4 shadow-[0_20px_60px_rgba(15,25,45,0.3)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="df-input !h-8 min-w-0 flex-1 text-[13px] font-medium"
            value={live.name}
            onChange={(e) => updateScene(scene.id, { name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); }}
            aria-label="Scene name"
          />
          <IconButton label="Close" onClick={onClose}><X size={14} /></IconButton>
        </div>
        <Field label="When this scene starts">
          <Segmented<SceneTransition>
            value={live.transition}
            onChange={(v) => updateScene(scene.id, { transition: v })}
            options={[{ value: 'cut', label: 'Cut' }, { value: 'fade', label: 'Fade' }, { value: 'wipe', label: 'Wipe' }]}
          />
        </Field>
        {live.transition !== 'cut' && (
          <Field label="Transition length">
            <Slider value={live.transitionDuration} onChange={(v) => updateScene(scene.id, { transitionDuration: v })} min={0.2} max={3} step={0.1} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-[12px] text-t2">
          <input type="checkbox" checked={!!live.clearBefore} onChange={(e) => updateScene(scene.id, { clearBefore: e.target.checked })} />
          Clear the board when this scene starts
        </label>
        <Field label="Paper for this scene">
          <select
            className="df-input"
            value={live.paper ?? ''}
            onChange={(e) => {
              const p = e.target.value as PaperStyle | '';
              updateScene(scene.id, p ? { paper: p, background: PAPERS.find((x) => x.id === p)?.color } : { paper: undefined, background: undefined });
            }}
          >
            <option value="">Same as project</option>
            {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] text-t1 hover:bg-hov disabled:opacity-40" disabled={index === 0} onClick={() => moveScene(scene.id, index - 1)}>
            <ChevronLeft size={12} /> Earlier
          </button>
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] text-t1 hover:bg-hov disabled:opacity-40" disabled={index >= count - 1} onClick={() => moveScene(scene.id, index + 1)}>
            Later <ChevronRight size={12} />
          </button>
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] text-t1 hover:bg-hov" onClick={() => { duplicateScene(scene.id); onClose(); }}>
            <Copy size={12} /> Duplicate
          </button>
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] text-t1 hover:bg-hov" onClick={() => { selectMany(members.map((m) => m.id)); onClose(); }}>
            Select elements
          </button>
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] text-t1 hover:bg-hov" title="Frame the camera on this whole scene for every element in it" onClick={() => updateElements(members.map((m) => m.id), { camera: 'scene' })}>
            Camera: whole scene
          </button>
          <button type="button" className="flex h-7 items-center gap-1 rounded-full border border-red-200 px-2.5 text-[11.5px] text-red-600 hover:bg-red-50" onClick={() => setConfirm(true)}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
        <p className="text-[11px] text-t3">{members.length} element{members.length === 1 ? '' : 's'} in this scene.</p>
        {confirm && (
          <ConfirmDialog
            title={`Delete "${live.name}"?`}
            message={members.length ? `Also delete its ${members.length} element${members.length === 1 ? '' : 's'}? Keep moves them to the previous scene.` : 'This scene is empty.'}
            confirmLabel={members.length ? 'Delete elements too' : 'Delete'}
            cancelLabel={members.length ? 'Keep elements' : 'Cancel'}
            onConfirm={() => { removeScene(scene.id, true); setConfirm(false); onClose(); }}
            onCancel={() => { if (members.length) { removeScene(scene.id, false); onClose(); } setConfirm(false); }}
            danger
          />
        )}
      </div>
    </div>
  );
}
