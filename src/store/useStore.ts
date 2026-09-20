import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore as useZustandStore } from 'zustand';
import type { AudioClip, DrawElement, ImageRef, Marker, Project, Scene } from '../types';
import { clamp } from '../lib/time';
import { END_ZOOM_SECONDS, cameraForElement, elementBounds, unionBounds } from '../lib/camera';
import { elementEnd, slotEnd } from '../lib/timing';
import { transformPath } from '../lib/svgPath';
import type { CameraView } from '../types';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type LayerOp = 'forward' | 'backward' | 'front' | 'back';

/** Animation settings that "copy timing" carries between elements. */
const ANIMATION_KEYS = [
  'drawDuration', 'pauseAfter', 'transitionIn', 'withPrevious', 'style', 'slideFrom', 'easing',
  'strokeOrder', 'revealMode', 'emphasis', 'exit', 'camera', 'cameraZoom', 'hand',
] as const satisfies readonly (keyof DrawElement)[];
type AnimationSettings = Pick<DrawElement, (typeof ANIMATION_KEYS)[number]>;

export interface AppState {
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];

  // playback
  currentTime: number;
  isPlaying: boolean;
  /** show the camera's view (what the video will show) instead of the whole artboard */
  cameraView: boolean;
  /**
   * The camera boundary shown in edit view, in canvas coords: the piece of
   * paper the video captures right now. New elements land inside it and
   * take it as their shot unless the previous shot already contains them.
   */
  cameraBoundary: { x: number; y: number; width: number; height: number } | null;
  /** ask the workspace to bring an element's camera frame into view */
  focusRequest: { id: string; n: number } | null;

  // editing
  /** primary selection (last clicked); `clip:<id>` for an audio clip */
  selectedId: string | null;
  /** every selected element (multi-select); never contains clip ids */
  selectedIds: string[];
  /** something is on the internal clipboard */
  canPaste: boolean;
  canPasteAnimation: boolean;

  // export
  isExporting: boolean;
  exportProgress: number; // 0..1
  ffmpegReady: boolean;

  // actions
  addElement(partial: Partial<DrawElement> & Pick<DrawElement, 'kind' | 'paths'>): DrawElement;
  updateElement(id: string, patch: Partial<DrawElement>): void;
  updateElements(ids: string[], patch: Partial<DrawElement> | ((el: DrawElement) => Partial<DrawElement>)): void;
  removeElement(id: string): void;
  removeElements(ids: string[]): void;
  duplicateElement(id: string): void;
  duplicateElements(ids: string[]): void;
  /** move an element to a new position in play order */
  reorder(id: string, newIndex: number): void;
  select(id: string | null): void;
  toggleSelect(id: string): void;
  selectMany(ids: string[]): void;
  selectAll(): void;
  nudge(ids: string[], dx: number, dy: number): void;
  align(ids: string[], mode: AlignMode): void;
  distribute(ids: string[], axis: 'h' | 'v'): void;
  setLayer(ids: string[], op: LayerOp): void;
  group(ids: string[]): void;
  ungroup(id: string): void;
  copy(ids: string[]): void;
  cut(ids: string[]): void;
  paste(): void;
  copyAnimation(id: string): void;
  pasteAnimation(ids: string[]): void;
  replaceImage(id: string, image: ImageRef, paths: string[]): void;
  setTime(t: number): void;
  play(): void;
  pause(): void;
  stop(): void;
  setCameraView(v: boolean): void;
  setCameraBoundary(r: AppState['cameraBoundary']): void;
  focusOn(id: string): void;
  /** start playback at an element's start time */
  playFrom(id: string): void;
  addAudioClip(clip: AudioClip): void;
  updateAudioClip(id: string, patch: Partial<AudioClip>): void;
  removeAudioClip(id: string): void;
  duplicateAudioClip(id: string): void;
  /** cut a clip in two at timeline time t (no-op if t is outside it) */
  splitAudioClip(id: string, t: number): void;
  addMarker(time: number, name?: string): void;
  updateMarker(id: string, patch: Partial<Marker>): void;
  removeMarker(id: string): void;
  // scenes
  addScene(name?: string): Scene;
  updateScene(id: string, patch: Partial<Scene>): void;
  removeScene(id: string, deleteElements: boolean): void;
  duplicateScene(id: string): void;
  moveScene(id: string, newIndex: number): void;
  /** put the selected elements in a scene */
  assignScene(ids: string[], sceneId: string): void;
  /** replace the whole document (project open / restore) */
  loadDocument(doc: { project: Project; elements: DrawElement[]; audioClips: AudioClip[] }): void;
  newProject(): void;
  updateProject(patch: Partial<Project>): void;
  setExporting(v: boolean): void;
  setExportProgress(p: number): void;
  setFfmpegReady(v: boolean): void;
}

export const DEFAULT_PROJECT: Project = {
  name: 'Untitled scribe',
  width: 1920,
  height: 1080,
  fps: 30,
  background: '#ffffff',
  paper: 'plain',
  duration: 5,
  hand: 'marker',
  cameraEasing: 'easeOut',
  cameraFill: 0.5,
  zoomAtEnd: false,   // end on the last shot; pulling back is opt-in
  endHold: 1.5,
  scenes: [],
  markers: [],
};

const MIN_DURATION = 3;
const CLIPBOARD_KEY = 'drawflow.clipboard';

/** Play order. */
export function sequenceOrder(elements: DrawElement[]): DrawElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/** Play order without hidden elements — what the timeline and camera see. */
export function activeSequence(elements: DrawElement[]): DrawElement[] {
  return sequenceOrder(elements).filter((e) => !e.hidden);
}

/**
 * Derive every element's startTime from the sequence: each starts when the
 * previous one's slot (draw + emphasis + pause) is over, plus its own
 * transition (the first element has no transition). "With previous" starts
 * together with the element before it. Hidden elements take no time.
 * Also normalizes zIndex to 0..n-1.
 */
function rechain(elements: DrawElement[]): DrawElement[] {
  let t = 0;            // when the next element may start
  let prevStart = 0;    // start of the previous visible element
  let first = true;
  return sequenceOrder(elements).map((el, i) => {
    let start: number;
    if (el.hidden) {
      start = t;
    } else if (first) {
      start = 0;
      first = false;
      prevStart = 0;
      t = Math.max(t, slotEnd({ ...el, startTime: start }));
    } else if (el.withPrevious) {
      start = prevStart;
      t = Math.max(t, slotEnd({ ...el, startTime: start }));
    } else {
      start = t + el.transitionIn;
      prevStart = start;
      t = slotEnd({ ...el, startTime: start });
    }
    return el.startTime === start && el.zIndex === i ? el : { ...el, startTime: start, zIndex: i };
  });
}

function contentEnd(elements: DrawElement[]): number {
  return elements.reduce((m, e) => (e.hidden ? m : Math.max(m, elementEnd(e))), 0);
}

function computeDuration(elements: DrawElement[], clips: AudioClip[], project: Project): number {
  let end = contentEnd(elements);
  if (elements.some((e) => !e.hidden)) {
    if (project.zoomAtEnd) end += END_ZOOM_SECONDS;
    end += project.endHold;
  }
  for (const c of clips) end = Math.max(end, c.startTime + c.duration);
  return Math.max(MIN_DURATION, end);
}

/** Every element carries a sceneId once scenes exist; gaps inherit from the element before. */
function normalizeScenes(elements: DrawElement[], scenes: Scene[] | undefined): DrawElement[] {
  if (!scenes || scenes.length === 0) return elements;
  const known = new Set(scenes.map((s) => s.id));
  let current = scenes[0].id;
  return sequenceOrder(elements).map((el) => {
    if (el.sceneId && known.has(el.sceneId)) { current = el.sceneId; return el; }
    return { ...el, sceneId: current };
  });
}

/** Apply a new element list: rechain, recompute duration, write to state. */
function commit(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  elements: DrawElement[],
  extra: Partial<AppState> = {},
): DrawElement[] {
  const project = { ...get().project, ...(extra.project ?? {}) };
  const clips = extra.audioClips ?? get().audioClips;
  const chained = rechain(normalizeScenes(elements, project.scenes));
  // keep the selection consistent with what exists
  const ids = new Set(chained.map((e) => e.id));
  const selectedIds = (extra.selectedIds ?? get().selectedIds).filter((id) => ids.has(id));
  let selectedId = extra.selectedId !== undefined ? extra.selectedId : get().selectedId;
  if (selectedId && !selectedId.startsWith('clip:') && !ids.has(selectedId)) selectedId = selectedIds[0] ?? null;
  set({
    ...extra,
    selectedIds,
    selectedId,
    elements: chained,
    project: { ...project, duration: computeDuration(chained, clips, project) },
  });
  return chained;
}

// --- clipboard (module scope: not part of history) --------------------------
let clipboard: DrawElement[] | null = null;
let animationClipboard: AnimationSettings | null = null;

function readClipboard(): DrawElement[] | null {
  if (clipboard) return clipboard;
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (raw) clipboard = JSON.parse(raw) as DrawElement[];
  } catch { /* ignore */ }
  return clipboard;
}

function writeClipboard(items: DrawElement[]): void {
  clipboard = items;
  try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(items)); } catch { /* quota / private mode */ }
}

function clone(el: DrawElement, dx = 0, dy = 0): DrawElement {
  return { ...el, id: crypto.randomUUID(), x: el.x + dx, y: el.y + dy };
}

/** Matrix for an element's local → canvas transform. */
function elementMatrix(el: DrawElement): [number, number, number, number, number, number] {
  const r = (el.rotation * Math.PI) / 180;
  const sx = el.scale * (el.flipX ? -1 : 1);
  const sy = el.scale * (el.flipY ? -1 : 1);
  const cos = Math.cos(r), sin = Math.sin(r);
  return [cos * sx, sin * sx, -sin * sy, cos * sy, el.x, el.y];
}

export const useStore = create<AppState>()(
  temporal(
    (set, get) => ({
      project: DEFAULT_PROJECT,
      elements: [],
      audioClips: [],
      currentTime: 0,
      isPlaying: false,
      cameraView: false,
      cameraBoundary: null,
      focusRequest: null,
      selectedId: null,
      selectedIds: [],
      canPaste: !!readClipboard(),
      canPasteAnimation: false,
      isExporting: false,
      exportProgress: 0,
      ffmpegReady: false,

      addElement(partial) {
        const { elements, project, selectedId } = get();
        const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
        // new elements join the scene of the selected element, else the last scene
        const sel = elements.find((e) => e.id === selectedId);
        const lastScene = project.scenes?.length ? project.scenes[project.scenes.length - 1].id : undefined;
        const el: DrawElement = {
          id: crypto.randomUUID(),
          label: partial.kind,
          fillColor: 'none',
          strokeColor: '#1a1a1a',
          strokeWidth: 4,
          fillAfterDraw: false,
          x: project.width / 2,
          y: project.height / 2,
          scale: 1,
          rotation: 0,
          startTime: 0,
          drawDuration: 2,
          pauseAfter: 0.5,
          transitionIn: 0.6,
          style: 'draw',
          slideFrom: 'left',
          zIndex: sel ? sel.zIndex + 0.5 : maxZ + 1,
          camera: 'auto',
          cameraZoom: 1,
          sceneId: sel?.sceneId ?? lastScene,
          ...partial,
        };
        const chained = commit(set, get, [...elements, el], { selectedId: el.id, selectedIds: [el.id] });
        return chained.find((e) => e.id === el.id) ?? el;
      },

      updateElement(id, patch) {
        const { elements } = get();
        commit(set, get, elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      },

      updateElements(ids, patch) {
        const want = new Set(ids);
        commit(set, get, get().elements.map((e) =>
          want.has(e.id) ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e));
      },

      removeElement(id) { get().removeElements([id]); },

      removeElements(ids) {
        const gone = new Set(ids);
        const { elements, selectedId } = get();
        commit(set, get, elements.filter((e) => !gone.has(e.id)), {
          selectedId: selectedId && gone.has(selectedId) ? null : selectedId,
          selectedIds: get().selectedIds.filter((id) => !gone.has(id)),
        });
      },

      duplicateElement(id) { get().duplicateElements([id]); },

      duplicateElements(ids) {
        const { elements } = get();
        const want = new Set(ids);
        const srcs = sequenceOrder(elements).filter((e) => want.has(e.id));
        if (srcs.length === 0) return;
        const last = srcs[srcs.length - 1];
        // copies land right after the last original, in the same order
        const copies = srcs.map((src, i) => ({ ...clone(src, 60, 60), zIndex: last.zIndex + (i + 1) / (srcs.length + 1) }));
        commit(set, get, [...elements, ...copies], { selectedId: copies[0].id, selectedIds: copies.map((c) => c.id) });
      },

      reorder(id, newIndex) {
        const { project } = get();
        const order = sequenceOrder(get().elements);
        const from = order.findIndex((e) => e.id === id);
        if (from === -1) return;
        const to = clamp(Math.round(newIndex), 0, order.length - 1);
        if (from === to) return;
        // remember the shot each element resolves to before the move
        const before = new Map<string, CameraView>();
        order.forEach((el, i) => before.set(el.id, cameraForElement(i, order, project)));
        const [moved] = order.splice(from, 1);
        // moving between scenes: adopt the neighbour's scene
        const neighbour = order[Math.min(to, order.length - 1)] ?? order[order.length - 1];
        const movedIn = { ...moved, sceneId: neighbour?.sceneId ?? moved.sceneId };
        order.splice(to, 0, movedIn);
        // an element set to "stay" must keep its own shot even when its new
        // predecessor belongs to a different one — pin it to the old shot
        const same = (a: CameraView, b: CameraView) =>
          Math.abs(a.cx - b.cx) < 1 && Math.abs(a.cy - b.cy) < 1 && Math.abs(a.zoom - b.zoom) < 1e-3;
        const next: DrawElement[] = [];
        order.forEach((el, i) => {
          let out: DrawElement = { ...el, zIndex: i };
          if (el.camera === 'previous') {
            const trial = [...next, out];
            const resolved = cameraForElement(i, trial, project);
            const old = before.get(el.id)!;
            if (!same(resolved, old)) out = { ...out, camera: 'custom', customCamera: old, transitionIn: Math.max(out.transitionIn, 0.8) };
          } else if (el.camera === 'custom' && el.customCamera && i > 0) {
            // a pinned shot identical to the predecessor's is just "stay"
            const prev = cameraForElement(i - 1, next, project);
            if (same(prev, el.customCamera)) out = { ...out, camera: 'previous', transitionIn: Math.min(out.transitionIn, 0.3) };
          }
          next.push(out);
        });
        commit(set, get, next);
      },

      select(id) {
        set({ selectedId: id, selectedIds: id && !id.startsWith('clip:') ? [id] : [] });
      },

      toggleSelect(id) {
        const cur = get().selectedIds;
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        set({ selectedIds: next, selectedId: next.length ? (cur.includes(id) ? next[next.length - 1] : id) : null });
      },

      selectMany(ids) {
        const known = new Set(get().elements.map((e) => e.id));
        const next = ids.filter((id) => known.has(id));
        set({ selectedIds: next, selectedId: next[next.length - 1] ?? null });
      },

      selectAll() {
        const ids = sequenceOrder(get().elements).filter((e) => !e.locked && !e.hidden).map((e) => e.id);
        set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null });
      },

      nudge(ids, dx, dy) {
        const want = new Set(ids);
        commit(set, get, get().elements.map((e) => (want.has(e.id) && !e.locked ? { ...e, x: e.x + dx, y: e.y + dy } : e)));
      },

      align(ids, mode) {
        const targets = get().elements.filter((e) => ids.includes(e.id) && !e.locked);
        if (targets.length === 0) return;
        // a single element aligns to the video frame; several align to each other
        const ref = targets.length > 1
          ? unionBounds(targets)!
          : { x: 0, y: 0, width: get().project.width, height: get().project.height };
        const moved = new Map<string, { x: number; y: number }>();
        for (const el of targets) {
          const b = elementBounds(el);
          let dx = 0, dy = 0;
          switch (mode) {
            case 'left': dx = ref.x - b.x; break;
            case 'hcenter': dx = ref.x + ref.width / 2 - (b.x + b.width / 2); break;
            case 'right': dx = ref.x + ref.width - (b.x + b.width); break;
            case 'top': dy = ref.y - b.y; break;
            case 'vcenter': dy = ref.y + ref.height / 2 - (b.y + b.height / 2); break;
            case 'bottom': dy = ref.y + ref.height - (b.y + b.height); break;
          }
          moved.set(el.id, { x: el.x + dx, y: el.y + dy });
        }
        commit(set, get, get().elements.map((e) => (moved.has(e.id) ? { ...e, ...moved.get(e.id)! } : e)));
      },

      distribute(ids, axis) {
        const targets = get().elements.filter((e) => ids.includes(e.id) && !e.locked);
        if (targets.length < 3) return;
        const items = targets
          .map((el) => ({ el, b: elementBounds(el) }))
          .sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
        const first = items[0].b, last = items[items.length - 1].b;
        const span = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y;
        const sizes = items.reduce((s, it) => s + (axis === 'h' ? it.b.width : it.b.height), 0);
        const gap = (span - sizes) / (items.length - 1);
        const moved = new Map<string, { x: number; y: number }>();
        let cursor = axis === 'h' ? first.x : first.y;
        for (const { el, b } of items) {
          const delta = cursor - (axis === 'h' ? b.x : b.y);
          moved.set(el.id, { x: el.x + (axis === 'h' ? delta : 0), y: el.y + (axis === 'v' ? delta : 0) });
          cursor += (axis === 'h' ? b.width : b.height) + gap;
        }
        commit(set, get, get().elements.map((e) => (moved.has(e.id) ? { ...e, ...moved.get(e.id)! } : e)));
      },

      setLayer(ids, op) {
        const { elements } = get();
        const layers = elements.map((e) => e.layer ?? 0);
        const max = Math.max(0, ...layers), min = Math.min(0, ...layers);
        const want = new Set(ids);
        commit(set, get, elements.map((e) => {
          if (!want.has(e.id)) return e;
          const cur = e.layer ?? 0;
          const layer = op === 'forward' ? cur + 1 : op === 'backward' ? cur - 1 : op === 'front' ? max + 1 : min - 1;
          return { ...e, layer };
        }));
      },

      group(ids) {
        const { elements } = get();
        const want = new Set(ids);
        const members = sequenceOrder(elements).filter((e) => want.has(e.id));
        // rasters can't be merged into paths; group vector elements only
        const vectors = members.filter((e) => e.kind !== 'image');
        if (vectors.length < 2) return;
        const u = unionBounds(vectors)!;
        const cx = u.x + u.width / 2, cy = u.y + u.height / 2;
        const paths: string[] = [];
        const pathFills: (string | null)[] = [];
        const pathStrokes: (string | null)[] = [];
        for (const el of vectors) {
          const m = elementMatrix(el);
          const local: [number, number, number, number, number, number] = [m[0], m[1], m[2], m[3], m[4] - cx, m[5] - cy];
          el.paths.forEach((d, i) => {
            paths.push(transformPath(d, local));
            pathFills.push(el.pathFills?.[i] ?? el.fillColor);
            pathStrokes.push(el.pathStrokes?.[i] ?? el.strokeColor);
          });
        }
        const first = vectors[0];
        const groupEl: DrawElement = {
          ...first,
          id: crypto.randomUUID(),
          kind: 'svg',
          label: `Group (${vectors.length})`,
          paths, pathFills, pathStrokes,
          x: cx, y: cy, scale: 1, rotation: 0, flipX: false, flipY: false,
          strokeWidth: first.strokeWidth,
          zIndex: first.zIndex,
          groupChildren: vectors,
          text: undefined, fontSize: undefined, fontFamily: undefined,
          drawDuration: vectors.reduce((s, e) => s + e.drawDuration, 0),
        };
        const gone = new Set(vectors.map((e) => e.id));
        commit(set, get, [...elements.filter((e) => !gone.has(e.id)), groupEl], { selectedId: groupEl.id, selectedIds: [groupEl.id] });
      },

      ungroup(id) {
        const { elements } = get();
        const g = elements.find((e) => e.id === id);
        if (!g?.groupChildren?.length) return;
        // put the children back, carrying the group's transform on top of their own
        const gm = elementMatrix(g);
        const kids = g.groupChildren.map((child, i) => {
          const u = unionBounds(g.groupChildren!)!;
          const cx = u.x + u.width / 2, cy = u.y + u.height / 2;
          // child position relative to the group's centre, mapped through the group transform
          const rx = child.x - cx, ry = child.y - cy;
          const x = gm[0] * rx + gm[2] * ry + gm[4];
          const y = gm[1] * rx + gm[3] * ry + gm[5];
          return {
            ...child,
            id: crypto.randomUUID(),
            x, y,
            scale: child.scale * g.scale,
            rotation: child.rotation + g.rotation,
            zIndex: g.zIndex + i / (g.groupChildren!.length + 1),
            sceneId: g.sceneId,
          };
        });
        commit(set, get, [...elements.filter((e) => e.id !== id), ...kids], {
          selectedId: kids[kids.length - 1].id, selectedIds: kids.map((k) => k.id),
        });
      },

      copy(ids) {
        const want = new Set(ids);
        const items = sequenceOrder(get().elements).filter((e) => want.has(e.id));
        if (items.length === 0) return;
        writeClipboard(items);
        set({ canPaste: true });
      },

      cut(ids) {
        get().copy(ids);
        get().removeElements(ids);
      },

      paste() {
        const items = readClipboard();
        if (!items?.length) return;
        const { elements, selectedId } = get();
        const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
        const sel = elements.find((e) => e.id === selectedId);
        const base = sel ? sel.zIndex : maxZ;
        const copies = items.map((it, i) => ({
          ...clone(it, 40, 40),
          zIndex: base + (i + 1) / (items.length + 1),
          sceneId: sel?.sceneId ?? it.sceneId,
        }));
        // pasting again offsets further so repeated pastes don't stack
        writeClipboard(copies.map((c) => ({ ...c })));
        commit(set, get, [...elements, ...copies], { selectedId: copies[copies.length - 1].id, selectedIds: copies.map((c) => c.id) });
      },

      copyAnimation(id) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) return;
        const out = {} as Record<string, unknown>;
        for (const k of ANIMATION_KEYS) out[k] = el[k];
        animationClipboard = out as AnimationSettings;
        set({ canPasteAnimation: true });
      },

      pasteAnimation(ids) {
        if (!animationClipboard) return;
        const patch = animationClipboard;
        get().updateElements(ids, () => ({ ...patch }));
      },

      replaceImage(id, image, paths) {
        get().updateElement(id, { image, paths, crop: undefined });
      },

      setTime(t) {
        set({ currentTime: clamp(t, 0, get().project.duration) });
      },

      play() {
        const { currentTime, project } = get();
        // restart from the top if the playhead is parked at the end
        if (currentTime >= project.duration - 1e-6) set({ currentTime: 0 });
        set({ isPlaying: true, cameraView: true, selectedId: null, selectedIds: [] });
      },
      pause() { set({ isPlaying: false }); },
      stop() { set({ isPlaying: false, currentTime: 0 }); },
      setCameraView(v) { set({ cameraView: v }); },
      setCameraBoundary(r) { set({ cameraBoundary: r }); },
      focusOn(id) { set({ focusRequest: { id, n: (get().focusRequest?.n ?? 0) + 1 } }); },
      playFrom(id) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) return;
        set({ currentTime: el.startTime, isPlaying: true, cameraView: true, selectedId: null, selectedIds: [] });
      },

      addAudioClip(clip) {
        commit(set, get, get().elements, { audioClips: [...get().audioClips, clip], selectedId: `clip:${clip.id}`, selectedIds: [] });
      },

      updateAudioClip(id, patch) {
        commit(set, get, get().elements, {
          audioClips: get().audioClips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      },

      removeAudioClip(id) {
        const { selectedId } = get();
        commit(set, get, get().elements, {
          audioClips: get().audioClips.filter((c) => c.id !== id),
          selectedId: selectedId === `clip:${id}` ? null : selectedId,
        });
      },

      duplicateAudioClip(id) {
        const src = get().audioClips.find((c) => c.id === id);
        if (!src) return;
        const copy: AudioClip = { ...src, id: crypto.randomUUID(), startTime: src.startTime + src.duration };
        commit(set, get, get().elements, { audioClips: [...get().audioClips, copy], selectedId: `clip:${copy.id}`, selectedIds: [] });
      },

      splitAudioClip(id, t) {
        const clips = get().audioClips;
        const c = clips.find((x) => x.id === id);
        if (!c) return;
        const at = t - c.startTime;
        if (at <= 0.05 || at >= c.duration - 0.05) return;
        const left: AudioClip = { ...c, duration: at, fadeOut: 0 };
        const right: AudioClip = {
          ...c, id: crypto.randomUUID(), startTime: t, offset: c.offset + at, duration: c.duration - at, fadeIn: 0,
        };
        commit(set, get, get().elements, {
          audioClips: clips.flatMap((x) => (x.id === id ? [left, right] : [x])),
          selectedId: `clip:${right.id}`,
          selectedIds: [],
        });
      },

      addMarker(time, name) {
        const markers = get().project.markers ?? [];
        const m: Marker = { id: crypto.randomUUID(), time, name: name ?? `Marker ${markers.length + 1}`, color: '#f59e0b' };
        get().updateProject({ markers: [...markers, m].sort((a, b) => a.time - b.time) });
      },
      updateMarker(id, patch) {
        const markers = (get().project.markers ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
        get().updateProject({ markers: markers.sort((a, b) => a.time - b.time) });
      },
      removeMarker(id) {
        get().updateProject({ markers: (get().project.markers ?? []).filter((m) => m.id !== id) });
      },

      // --- scenes ---------------------------------------------------------
      addScene(name) {
        const { project, elements } = get();
        const scenes = project.scenes ?? [];
        const scene: Scene = {
          id: crypto.randomUUID(),
          name: name ?? `Scene ${scenes.length + 1}`,
          transition: 'cut',
          transitionDuration: 0.6,
        };
        // the first scene adopts everything that already exists
        const next = scenes.length === 0 ? elements.map((e) => ({ ...e, sceneId: scene.id })) : elements;
        commit(set, get, next, { project: { ...project, scenes: [...scenes, scene] } });
        return scene;
      },

      updateScene(id, patch) {
        const scenes = (get().project.scenes ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
        get().updateProject({ scenes });
      },

      removeScene(id, deleteElements) {
        const { project, elements } = get();
        const scenes = project.scenes ?? [];
        if (!scenes.some((s) => s.id === id)) return;
        const remaining = scenes.filter((s) => s.id !== id);
        const idx = scenes.findIndex((s) => s.id === id);
        const fallback = remaining[Math.max(0, idx - 1)]?.id;
        const next = deleteElements
          ? elements.filter((e) => e.sceneId !== id)
          : elements.map((e) => (e.sceneId === id ? { ...e, sceneId: fallback } : e));
        commit(set, get, next, {
          project: { ...project, scenes: remaining },
          audioClips: get().audioClips.map((c) => (c.sceneId === id ? { ...c, sceneId: undefined } : c)),
        });
      },

      duplicateScene(id) {
        const { project, elements } = get();
        const scenes = project.scenes ?? [];
        const idx = scenes.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const copy: Scene = { ...scenes[idx], id: crypto.randomUUID(), name: `${scenes[idx].name} copy` };
        const members = sequenceOrder(elements).filter((e) => e.sceneId === id);
        const last = members[members.length - 1];
        const base = last ? last.zIndex : elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
        const clones = members.map((e, i) => ({ ...clone(e), sceneId: copy.id, zIndex: base + (i + 1) / (members.length + 1) }));
        const nextScenes = [...scenes.slice(0, idx + 1), copy, ...scenes.slice(idx + 1)];
        commit(set, get, [...elements, ...clones], { project: { ...project, scenes: nextScenes } });
      },

      moveScene(id, newIndex) {
        const { project, elements, audioClips } = get();
        const scenes = [...(project.scenes ?? [])];
        const from = scenes.findIndex((s) => s.id === id);
        if (from === -1) return;
        const to = clamp(Math.round(newIndex), 0, scenes.length - 1);
        if (from === to) return;
        const [s] = scenes.splice(from, 1);
        scenes.splice(to, 0, s);
        // renumber play order scene by scene; remember where each scene used to start
        const oldStart = new Map<string, number>();
        for (const sc of project.scenes ?? []) {
          const first = sequenceOrder(elements).find((e) => e.sceneId === sc.id);
          oldStart.set(sc.id, first ? first.startTime - first.transitionIn : 0);
        }
        const order = scenes.flatMap((sc) => sequenceOrder(elements).filter((e) => e.sceneId === sc.id));
        const rest = elements.filter((e) => !order.includes(e));
        const renumbered = [...order, ...rest].map((e, i) => ({ ...e, zIndex: i }));
        const chained = commit(set, get, renumbered, { project: { ...project, scenes } });
        // scene-bound audio follows its scene
        const shifted = audioClips.map((c) => {
          if (!c.sceneId) return c;
          const first = chained.find((e) => e.sceneId === c.sceneId);
          const before = oldStart.get(c.sceneId);
          if (!first || before === undefined) return c;
          const delta = first.startTime - first.transitionIn - before;
          return delta ? { ...c, startTime: Math.max(0, c.startTime + delta) } : c;
        });
        if (shifted.some((c, i) => c !== audioClips[i])) commit(set, get, chained, { audioClips: shifted });
      },

      assignScene(ids, sceneId) {
        const want = new Set(ids);
        const { elements } = get();
        const members = sequenceOrder(elements).filter((e) => e.sceneId === sceneId);
        const last = members[members.length - 1];
        // moved elements go to the end of the target scene, keeping their order
        const moving = sequenceOrder(elements).filter((e) => want.has(e.id));
        const base = last ? last.zIndex : -1;
        const next = elements.map((e) => {
          const i = moving.findIndex((m) => m.id === e.id);
          return i === -1 ? e : { ...e, sceneId, zIndex: base + (i + 1) / (moving.length + 1) };
        });
        commit(set, get, next);
      },

      loadDocument(doc) {
        set({ project: doc.project, isPlaying: false, currentTime: 0, selectedId: null, selectedIds: [], cameraView: false });
        commit(set, get, doc.elements, { audioClips: doc.audioClips, project: { ...DEFAULT_PROJECT, ...doc.project } });
      },

      newProject() {
        set({ isPlaying: false, currentTime: 0, selectedId: null, selectedIds: [], cameraView: false });
        commit(set, get, [], { audioClips: [], project: { ...DEFAULT_PROJECT } });
      },

      updateProject(patch) {
        commit(set, get, get().elements, { project: { ...get().project, ...patch } });
      },

      setExporting(v) { set({ isExporting: v, exportProgress: 0 }); },
      setExportProgress(p) { set({ exportProgress: p }); },
      setFfmpegReady(v) { set({ ffmpegReady: v }); },
    }),
    {
      // Only document state goes in history — never currentTime/isPlaying/
      // export fields, or every scrub becomes an undo step (spec pitfall #3).
      partialize: (s) => ({ elements: s.elements, audioClips: s.audioClips, project: s.project }),
      limit: 100,
      // collapse rapid-fire updates (drags, slider scrubs) into one undo step
      handleSet: (handleSet) => {
        let last = 0;
        return ((state: Parameters<typeof handleSet>[0]) => {
          const now = Date.now();
          if (now - last < 250) return;
          last = now;
          handleSet(state);
        }) as typeof handleSet;
      },
    },
  ),
);

export function undo() { useStore.temporal.getState().undo(); }
export function redo() { useStore.temporal.getState().redo(); }

export function useCanUndoRedo(): { canUndo: boolean; canRedo: boolean } {
  const past = useZustandStore(useStore.temporal, (s) => s.pastStates.length);
  const future = useZustandStore(useStore.temporal, (s) => s.futureStates.length);
  return { canUndo: past > 0, canRedo: future > 0 };
}
