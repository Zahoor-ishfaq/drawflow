import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { slotEnd } from '../../lib/timing';
import { PAPERS } from '../../assets/paper';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import type { PaperStyle, Scene, SceneTransition } from '../../types';

const SCENE_COLORS = ['#0d9d97', '#5b7cfa', '#e0722f', '#8b5cf6', '#10b981', '#ec4899'];

function SceneEditor({ scene, index, count, onClose }: { scene: Scene; index: number; count: number; onClose: () => void }) {
  const { updateScene, removeScene, duplicateScene, moveScene, updateElements, selectMany } = useStore.getState();
  const elements = useStore((s) => s.elements);
  const [confirm, setConfirm] = useState(false);
  const members = elements.filter((e) => e.sceneId === scene.id);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-9 left-0 z-40 flex w-[300px] flex-col gap-2.5 rounded-xl border border-line bg-panel p-3 shadow-[0_12px_40px_rgba(25,35,55,0.2)]">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="df-input !h-7 min-w-0 flex-1 text-[12.5px]"
          value={scene.name}
          onChange={(e) => updateScene(scene.id, { name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); }}
          aria-label="Scene name"
        />
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-t2 hover:bg-hov" onClick={onClose} aria-label="Close"><X size={13} /></button>
      </div>
      <Field label="When this scene starts">
        <Segmented<SceneTransition>
          value={scene.transition}
          onChange={(v) => updateScene(scene.id, { transition: v })}
          options={[{ value: 'cut', label: 'Cut' }, { value: 'fade', label: 'Fade' }, { value: 'wipe', label: 'Wipe' }]}
        />
      </Field>
      {scene.transition !== 'cut' && (
        <Field label="Transition length">
          <Slider value={scene.transitionDuration} onChange={(v) => updateScene(scene.id, { transitionDuration: v })} min={0.2} max={3} step={0.1} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[12px] text-t2">
        <input type="checkbox" checked={!!scene.clearBefore} onChange={(e) => updateScene(scene.id, { clearBefore: e.target.checked })} />
        Clear the board when this scene starts
      </label>
      <Field label="Paper for this scene">
        <select
          className="df-input"
          value={scene.paper ?? ''}
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
          title={`Delete "${scene.name}"?`}
          message={members.length ? `Also delete its ${members.length} element${members.length === 1 ? '' : 's'}? Keep moves them to the previous scene.` : 'This scene is empty.'}
          confirmLabel={members.length ? 'Delete elements too' : 'Delete'}
          cancelLabel={members.length ? 'Keep elements' : 'Cancel'}
          onConfirm={() => { removeScene(scene.id, true); setConfirm(false); onClose(); }}
          onCancel={() => { if (members.length) { removeScene(scene.id, false); onClose(); } setConfirm(false); }}
          danger
        />
      )}
    </div>
  );
}

/** Scene chips above the timeline; click a chip to edit the scene. */
export function ScenesBar() {
  const scenes = useStore((s) => s.project.scenes ?? []);
  const sequence = useSequence();
  const currentTime = useStore((s) => s.currentTime);
  const addScene = useStore((s) => s.addScene);
  const [editing, setEditing] = useState<string | null>(null);

  if (scenes.length === 0) {
    return (
      <div className="flex h-8 items-center gap-2 border-b border-line px-4 text-[11.5px] text-t3">
        <button
          type="button"
          className="flex h-6 items-center gap-1 rounded-full border border-line bg-panel px-2.5 text-[11.5px] font-medium text-t1 hover:bg-hov"
          onClick={() => { addScene('Scene 1'); }}
          title="Split the scribe into named scenes"
        >
          <Plus size={12} /> Scenes
        </button>
        Organise the scribe into scenes: transitions, per-scene paper, camera framing and export.
      </div>
    );
  }

  const spans = scenes.map((sc, i) => {
    const members = sequence.filter((e) => e.sceneId === sc.id && !e.hidden);
    const start = members.length ? members[0].startTime - members[0].transitionIn : null;
    const end = members.length ? Math.max(...members.map(slotEnd)) : null;
    return { scene: sc, index: i, members, start, end };
  });

  return (
    <div className="relative flex h-9 items-center gap-1.5 overflow-x-auto border-b border-line px-4">
      {spans.map(({ scene, index, members, start, end }) => {
        const active = start !== null && end !== null && currentTime >= start && currentTime < end;
        const color = SCENE_COLORS[index % SCENE_COLORS.length];
        return (
          <div key={scene.id} className="relative shrink-0">
            <button
              type="button"
              className={
                'flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] hover:bg-hov ' +
                (editing === scene.id ? 'border-t1 ' : 'border-line ') + (active ? 'font-medium text-t1' : 'text-t2')
              }
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              onClick={() => setEditing((cur) => (cur === scene.id ? null : scene.id))}
              onDoubleClick={() => { if (start !== null) { useStore.getState().pause(); useStore.getState().setTime(start); } }}
              title={`${scene.name} — ${members.length} element${members.length === 1 ? '' : 's'}${start !== null ? ` · ${start.toFixed(1)}s → ${end!.toFixed(1)}s` : ''}\nclick to edit · double-click to jump to it`}
            >
              {scene.name}
              <span className="tabular text-[10px] text-t3">{members.length}</span>
            </button>
            {editing === scene.id && (
              <SceneEditor scene={scene} index={index} count={scenes.length} onClose={() => setEditing(null)} />
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-t2 hover:bg-hov hover:text-t1"
        onClick={() => { const sc = addScene(); setEditing(sc.id); }}
        title="Add a scene (new elements go into the selected or last scene)"
        aria-label="Add scene"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
