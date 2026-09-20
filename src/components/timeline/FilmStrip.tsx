import { memo, useEffect, useRef, useState } from 'react';
import {
  Camera, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, FilePlus2, Film, Hand, Hourglass, Layers, Lock, LockOpen,
  Pencil, Play, Plus, Settings2, Trash2,
} from 'lucide-react';
import type { DrawElement, Scene } from '../../types';
import { useStore } from '../../store/useStore';
import { useSequence } from '../../store/selectors';
import { measurePaths } from '../../lib/drawing';
import { pathColors } from '../../lib/renderFrame';
import { clamp } from '../../lib/time';
import { slotEnd } from '../../lib/timing';
import { ContextMenu, useContextMenu, type MenuEntry } from '../ui/ContextMenu';
import { SceneEditor } from './SceneEditor';

const CARD_W = 104;
const CONNECTOR_W = 26;
const SLOT_WIDTH = CARD_W + CONNECTOR_W;
const SCENE_COLORS = ['#0d9d97', '#5b7cfa', '#e0722f', '#8b5cf6', '#10b981', '#ec4899'];

/** Mini preview of an element's artwork. */
const ElementThumb = memo(function ElementThumb({ el }: { el: DrawElement }) {
  if (el.kind === 'image' && el.image) {
    return <img src={el.image.src} alt="" className="h-full w-full object-contain" draggable={false} />;
  }
  const b = measurePaths(el.paths).bbox;
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  const pad = Math.max(w, h) * 0.1;
  return (
    <svg viewBox={`${b.x - pad} ${b.y - pad} ${w + pad * 2} ${h + pad * 2}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {el.paths.map((d, i) => {
        const { fill, stroke } = pathColors(el, i);
        return (
          <path key={i} d={d} fill={fill} fillRule={el.fillRule ?? 'nonzero'} stroke={stroke}
            strokeWidth={el.pathFills ? Math.max(w, h) / 400 : Math.max(w, h) / 36} strokeLinecap="round" strokeLinejoin="round" />
        );
      })}
    </svg>
  );
});

type Target = { kind: 'element'; el: DrawElement; index: number } | { kind: 'scene'; scene: Scene; index: number } | { kind: 'empty' };

function Card({ el, index, count, onMenu, onRename, renaming, setRenaming }: {
  el: DrawElement; index: number; count: number;
  onMenu: (e: React.MouseEvent, t: Target) => void;
  onRename: (name: string) => void; renaming: boolean; setRenaming: (v: boolean) => void;
}) {
  const selected = useStore((s) => s.selectedIds.includes(el.id));
  const currentTime = useStore((s) => s.currentTime);
  const paperDark = useStore((s) => s.project.paper === 'chalkboard');
  const drag = useRef<{ startX: number; curIndex: number; moved: boolean } | null>(null);
  const [lift, setLift] = useState<number | null>(null); // px offset while dragging

  const active = currentTime >= el.startTime && currentTime < slotEnd(el);
  const progress = clamp((currentTime - el.startTime) / Math.max(el.drawDuration, 1e-6), 0, 1);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = useStore.getState();
    s.pause();
    if (e.shiftKey || e.ctrlKey || e.metaKey) s.toggleSelect(el.id);
    else if (!s.selectedIds.includes(el.id)) s.select(el.id);
    drag.current = { startX: e.clientX, curIndex: index, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    const target = clamp(d.curIndex + Math.round(dx / SLOT_WIDTH), 0, count - 1);
    if (target !== d.curIndex) {
      useStore.getState().reorder(el.id, target);
      d.startX += (target - d.curIndex) * SLOT_WIDTH;
      d.curIndex = target;
    }
    setLift(e.clientX - d.startX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setLift(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d && !d.moved) {
      const s = useStore.getState();
      if (s.cameraView) s.setTime(el.startTime);
      else s.focusOn(el.id);
    }
  };

  return (
    <div className="flex items-start">
      {index > 0 && (
        <div className="flex h-[62px] flex-col items-center justify-center" style={{ width: CONNECTOR_W }}>
          <div className="h-px w-full bg-line" />
          <span className="tabular mt-1 text-[9.5px] text-t3" title="Transition: camera travel time into this element">
            {el.transitionIn > 0 && !el.withPrevious ? `${el.transitionIn.toFixed(1)}s` : el.withPrevious ? '∥' : ''}
          </span>
        </div>
      )}
      <div
        className={'group shrink-0 select-none ' + (lift !== null ? 'relative z-20 cursor-grabbing' : 'cursor-grab transition-transform duration-150')}
        style={{
          width: CARD_W,
          transform: lift !== null ? `translateX(${lift}px) scale(1.06)` : undefined,
          filter: lift !== null ? 'drop-shadow(0 10px 16px rgba(25,35,55,0.28))' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => onMenu(e, { kind: 'element', el, index })}
        onDoubleClick={() => setRenaming(true)}
        title={`${el.label} — click to go to it, drag to reorder, right-click for options`}
      >
        <div
          className={
            'df-ui-anim relative h-[62px] overflow-hidden rounded-xl border-2 p-1.5 transition-colors ' +
            (paperDark ? 'bg-[#2c473d] ' : 'bg-artboard ') +
            (selected ? 'border-accent shadow-[0_2px_10px_rgba(13,157,151,0.25)]' : active ? 'border-[#8fd4d1]' : 'border-line hover:border-[#c3cad4]') +
            (el.hidden ? ' opacity-50' : '')
          }
        >
          <ElementThumb el={el} />
          {el.camera !== 'auto' && (
            <span className="absolute top-1 right-1 rounded-md bg-[#1d2430]/60 p-0.5 text-white" title="Custom camera framing"><Camera size={9} /></span>
          )}
          {el.style !== 'draw' && (
            <span className="absolute top-1 left-1 rounded-md bg-[#1d2430]/60 px-1 text-[8.5px] font-medium text-white">{el.style.replace('plugin:', '')}</span>
          )}
          {active && <span className="absolute bottom-0 left-0 h-[3px] bg-accent" style={{ width: `${progress * 100}%` }} />}
          <button
            type="button"
            title="Play from here"
            aria-label={`Play from ${el.label}`}
            className="df-ui-anim absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow transition-opacity group-hover:opacity-100 hover:brightness-110"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); useStore.getState().playFrom(el.id); }}
          >
            <Play size={10} className="ml-px" />
          </button>
        </div>
        {renaming ? (
          <input
            autoFocus
            className="df-input mt-1 !h-6 w-full !px-1.5 text-center text-[11px]"
            defaultValue={el.label}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => { onRename(e.target.value); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }}
          />
        ) : (
          <div className={'mt-1 truncate text-center text-[11px] ' + (selected ? 'font-medium text-t1' : 'text-t2')}>
            {index + 1}. {el.label}
          </div>
        )}
        <div className="tabular mt-0.5 flex items-center justify-center gap-1.5 text-[9.5px] text-t3">
          <span className="flex items-center gap-0.5" title="Animate (draw) time">
            {el.style === 'draw' ? <Hand size={9} /> : <Pencil size={9} />}{el.drawDuration.toFixed(1)}
          </span>
          <span className="flex items-center gap-0.5" title="Pause after"><Hourglass size={9} />{el.pauseAfter.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

/** Scene label above a run of cards: click to jump, double-click to rename, right-click for options. */
function SceneHeader({ scene, index, count, start, onMenu, renaming, setRenaming }: {
  scene: Scene; index: number; count: number; start: number | null;
  onMenu: (e: React.MouseEvent, t: Target) => void; renaming: boolean; setRenaming: (v: boolean) => void;
}) {
  const updateScene = useStore((s) => s.updateScene);
  const color = SCENE_COLORS[index % SCENE_COLORS.length];
  return (
    <div
      className="flex h-6 items-center gap-1.5 pl-1"
      onContextMenu={(e) => onMenu(e, { kind: 'scene', scene, index })}
      onDoubleClick={() => setRenaming(true)}
      title={`${scene.name} — ${count} element${count === 1 ? '' : 's'} · click to jump here · double-click to rename · right-click for options`}
    >
      <span className="h-3 w-1 rounded-full" style={{ background: color }} />
      {renaming ? (
        <input
          autoFocus
          className="df-input !h-5 w-[140px] !px-1.5 text-[11px]"
          defaultValue={scene.name}
          onBlur={(e) => { updateScene(scene.id, { name: e.target.value.trim() || scene.name }); setRenaming(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }}
        />
      ) : (
        <button
          type="button"
          className="truncate text-[11px] font-medium text-t1 hover:text-accent"
          onClick={() => { if (start !== null) { const s = useStore.getState(); s.pause(); s.setTime(start); } }}
        >
          {scene.name}
        </button>
      )}
      <span className="text-[10px] text-t3">{count}</span>
      {scene.transition !== 'cut' && index > 0 && <span className="text-[9.5px] text-t3">· {scene.transition}</span>}
    </div>
  );
}

/** VideoScribe-style strip: elements as thumbnails in play order, grouped by scene. */
export function FilmStrip() {
  const ordered = useSequence();
  const scenes = useStore((s) => s.project.scenes ?? []);
  const { menu, open, close } = useContextMenu<Target>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [sceneSettings, setSceneSettings] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const s = useStore.getState();

  // keep the selected card in view
  const selectedId = useStore((st) => st.selectedId);
  useEffect(() => {
    if (!selectedId) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-card="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  const entries = (t: Target): MenuEntry[] => {
    const scenesList = useStore.getState().project.scenes ?? [];
    if (t.kind === 'element') {
      const { el, index } = t;
      const ids = useStore.getState().selectedIds.includes(el.id) ? useStore.getState().selectedIds : [el.id];
      return [
        { label: 'Play from here', icon: <Play size={13} />, onClick: () => s.playFrom(el.id) },
        { label: 'Rename…', icon: <Pencil size={13} />, onClick: () => setRenaming(el.id) },
        { label: 'Duplicate', icon: <Copy size={13} />, hint: 'Ctrl+D', onClick: () => s.duplicateElements(ids) },
        { separator: true },
        { label: 'Play earlier', icon: <ChevronLeft size={13} />, disabled: index === 0, onClick: () => s.reorder(el.id, index - 1) },
        { label: 'Play later', icon: <ChevronRight size={13} />, disabled: index >= ordered.length - 1, onClick: () => s.reorder(el.id, index + 1) },
        { label: el.withPrevious ? 'Play after the previous one' : 'Play together with the previous', icon: <Layers size={13} />, disabled: index === 0, onClick: () => s.updateElements(ids, (x) => ({ withPrevious: !x.withPrevious })) },
        ...(scenesList.length ? [{ label: 'Move to scene', icon: <Film size={13} />, children: scenesList.map((sc) => ({ label: sc.name, disabled: sc.id === el.sceneId, onClick: () => s.assignScene(ids, sc.id) })) }] : []),
        { separator: true },
        { label: el.locked ? 'Unlock' : 'Lock', icon: el.locked ? <LockOpen size={13} /> : <Lock size={13} />, hint: 'Ctrl+L', onClick: () => s.updateElements(ids, (x) => ({ locked: !x.locked })) },
        { label: el.hidden ? 'Show in the video' : 'Hide from the video', icon: el.hidden ? <Eye size={13} /> : <EyeOff size={13} />, onClick: () => s.updateElements(ids, (x) => ({ hidden: !x.hidden })) },
        { separator: true },
        { label: ids.length > 1 ? `Delete ${ids.length} elements` : 'Delete', icon: <Trash2 size={13} />, hint: 'Del', danger: true, onClick: () => s.removeElements(ids) },
      ];
    }
    if (t.kind === 'scene') {
      const { scene, index } = t;
      const members = ordered.filter((e) => e.sceneId === scene.id);
      return [
        { label: 'Rename…', icon: <Pencil size={13} />, onClick: () => setRenaming(`scene:${scene.id}`) },
        { label: 'Scene settings…', icon: <Settings2 size={13} />, hint: 'transition, paper', onClick: () => setSceneSettings(scene.id) },
        { label: 'Select its elements', icon: <Layers size={13} />, disabled: members.length === 0, onClick: () => s.selectMany(members.map((m) => m.id)) },
        { label: 'Camera: frame the whole scene', icon: <Camera size={13} />, disabled: members.length === 0, onClick: () => s.updateElements(members.map((m) => m.id), { camera: 'scene' }) },
        { separator: true },
        { label: 'Add a scene after this one', icon: <Plus size={13} />, onClick: () => addSceneAfter(index) },
        { label: 'Duplicate scene', icon: <Copy size={13} />, onClick: () => s.duplicateScene(scene.id) },
        { label: 'Move earlier', icon: <ChevronLeft size={13} />, disabled: index === 0, onClick: () => s.moveScene(scene.id, index - 1) },
        { label: 'Move later', icon: <ChevronRight size={13} />, disabled: index >= scenesList.length - 1, onClick: () => s.moveScene(scene.id, index + 1) },
        { separator: true },
        { label: 'Delete scene, keep elements', icon: <Trash2 size={13} />, onClick: () => s.removeScene(scene.id, false) },
        { label: 'Delete scene and its elements', icon: <Trash2 size={13} />, danger: true, disabled: members.length === 0, onClick: () => s.removeScene(scene.id, true) },
      ];
    }
    return [
      { label: 'New scene', icon: <FilePlus2 size={13} />, onClick: () => addSceneAfter((useStore.getState().project.scenes ?? []).length - 1) },
    ];
  };

  /** Add a scene and move the view to fresh paper so its elements land beside the others. */
  const addSceneAfter = (index: number) => {
    const st = useStore.getState();
    const sc = st.addScene();
    const list = useStore.getState().project.scenes ?? [];
    if (index >= 0 && index < list.length - 1) useStore.getState().moveScene(sc.id, index + 1);
    useStore.getState().focusOn(`region:${sc.id}`);
    setRenaming(`scene:${sc.id}`);
  };

  if (ordered.length === 0) {
    return (
      <div className="flex h-[104px] items-center justify-center text-[12.5px] text-t3" onContextMenu={(e) => open(e, { kind: 'empty' })}>
        Elements you add will appear here in the order they are drawn
        {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries(menu.target)} onClose={close} />}
      </div>
    );
  }

  // group consecutive cards by scene (elements without a scene form a nameless group)
  const groups: { scene: Scene | null; sceneIndex: number; cards: { el: DrawElement; index: number }[] }[] = [];
  ordered.forEach((el, index) => {
    const scene = scenes.find((sc) => sc.id === el.sceneId) ?? null;
    const last = groups[groups.length - 1];
    if (last && last.scene?.id === scene?.id) last.cards.push({ el, index });
    else groups.push({ scene, sceneIndex: scene ? scenes.indexOf(scene) : -1, cards: [{ el, index }] });
  });

  return (
    <div ref={stripRef} className="flex h-[128px] items-start overflow-x-auto overflow-y-hidden px-1 pb-1" onContextMenu={(e) => open(e, { kind: 'empty' })}>
      {groups.map((g, gi) => (
        <div key={g.scene?.id ?? `nogroup-${gi}`} className={'flex shrink-0 flex-col ' + (gi > 0 ? 'ml-3 border-l border-dashed border-line pl-2' : '')}>
          {g.scene ? (
            <SceneHeader
              scene={g.scene}
              index={g.sceneIndex}
              count={g.cards.length}
              start={g.cards[0] ? Math.max(0, g.cards[0].el.startTime - g.cards[0].el.transitionIn) : null}
              onMenu={open}
              renaming={renaming === `scene:${g.scene.id}`}
              setRenaming={(v) => setRenaming(v ? `scene:${g.scene!.id}` : null)}
            />
          ) : (
            <div className="h-6" />
          )}
          <div className="flex items-start">
            {g.cards.map(({ el, index }) => (
              <div key={el.id} data-card={el.id}>
                <Card
                  el={el}
                  index={index}
                  count={ordered.length}
                  onMenu={open}
                  renaming={renaming === el.id}
                  setRenaming={(v) => setRenaming(v ? el.id : null)}
                  onRename={(name) => s.updateElement(el.id, { label: name.trim() || el.label })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="mt-6 ml-3 flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-[10px] text-t3 hover:border-accent hover:text-accent"
        title="Add a scene (a new stretch of paper for the next part of the story)"
        onClick={() => addSceneAfter((useStore.getState().project.scenes ?? []).length - 1)}
      >
        <Plus size={14} /> Scene
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries(menu.target)} onClose={close} />}
      {sceneSettings && (() => {
        const sc = scenes.find((x) => x.id === sceneSettings);
        return sc ? <SceneEditor scene={sc} index={scenes.indexOf(sc)} count={scenes.length} onClose={() => setSceneSettings(null)} /> : null;
      })()}
    </div>
  );
}
