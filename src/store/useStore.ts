import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore as useZustandStore } from 'zustand';
import type { AudioClip, DrawElement, Project } from '../types';
import { clamp } from '../lib/time';
import { END_ZOOM_SECONDS, cameraForElement } from '../lib/camera';
import type { CameraView } from '../types';

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
  selectedId: string | null;

  // export
  isExporting: boolean;
  exportProgress: number; // 0..1
  ffmpegReady: boolean;

  // actions
  addElement(partial: Partial<DrawElement> & Pick<DrawElement, 'kind' | 'paths'>): DrawElement;
  updateElement(id: string, patch: Partial<DrawElement>): void;
  removeElement(id: string): void;
  duplicateElement(id: string): void;
  /** move an element to a new position in play order (= stacking order) */
  reorder(id: string, newIndex: number): void;
  select(id: string | null): void;
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
  /** replace the whole document (project open / restore) */
  loadDocument(doc: { project: Project; elements: DrawElement[]; audioClips: AudioClip[] }): void;
  newProject(): void;
  updateProject(patch: Partial<Project>): void;
  setExporting(v: boolean): void;
  setExportProgress(p: number): void;
  setFfmpegReady(v: boolean): void;
}

const DEFAULT_PROJECT: Project = {
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
};

const MIN_DURATION = 3;

/** Play order = stacking order (later elements draw on top). */
export function sequenceOrder(elements: DrawElement[]): DrawElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Derive every element's startTime from the sequence: each starts when the
 * previous one has finished drawing and pausing, plus its own transition
 * (the first element has no transition). Also normalizes zIndex to 0..n-1.
 */
function rechain(elements: DrawElement[]): DrawElement[] {
  let t = 0;
  return sequenceOrder(elements).map((el, i) => {
    const start = i === 0 ? 0 : t + el.transitionIn;
    t = start + el.drawDuration + el.pauseAfter;
    return el.startTime === start && el.zIndex === i ? el : { ...el, startTime: start, zIndex: i };
  });
}

function contentEnd(elements: DrawElement[]): number {
  return elements.reduce((m, e) => Math.max(m, e.startTime + e.drawDuration + e.pauseAfter), 0);
}

function computeDuration(elements: DrawElement[], clips: AudioClip[], project: Project): number {
  let end = contentEnd(elements);
  if (elements.length > 0) {
    if (project.zoomAtEnd) end += END_ZOOM_SECONDS;
    end += project.endHold;
  }
  for (const c of clips) end = Math.max(end, c.startTime + c.duration);
  return Math.max(MIN_DURATION, end);
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
  const chained = rechain(elements);
  set({
    ...extra,
    elements: chained,
    project: { ...project, duration: computeDuration(chained, clips, project) },
  });
  return chained;
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
      isExporting: false,
      exportProgress: 0,
      ffmpegReady: false,

      addElement(partial) {
        const { elements, project } = get();
        const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
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
          zIndex: maxZ + 1,
          camera: 'auto',
          cameraZoom: 1,
          ...partial,
        };
        const chained = commit(set, get, [...elements, el], { selectedId: el.id });
        return chained.find((e) => e.id === el.id) ?? el;
      },

      updateElement(id, patch) {
        const { elements } = get();
        commit(set, get, elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      },

      removeElement(id) {
        const { elements, selectedId } = get();
        commit(set, get, elements.filter((e) => e.id !== id), {
          selectedId: selectedId === id ? null : selectedId,
        });
      },

      duplicateElement(id) {
        const { elements } = get();
        const src = elements.find((e) => e.id === id);
        if (!src) return;
        const copy: DrawElement = {
          ...src,
          id: crypto.randomUUID(),
          x: src.x + 60,
          y: src.y + 60,
          zIndex: src.zIndex + 0.5, // lands right after the original
        };
        commit(set, get, [...elements, copy], { selectedId: copy.id });
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
        order.splice(to, 0, moved);
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

      select(id) { set({ selectedId: id }); },

      setTime(t) {
        set({ currentTime: clamp(t, 0, get().project.duration) });
      },

      play() {
        const { currentTime, project } = get();
        // restart from the top if the playhead is parked at the end
        if (currentTime >= project.duration - 1e-6) set({ currentTime: 0 });
        set({ isPlaying: true, cameraView: true, selectedId: null });
      },
      pause() { set({ isPlaying: false }); },
      stop() { set({ isPlaying: false, currentTime: 0 }); },
      setCameraView(v) { set({ cameraView: v }); },
      setCameraBoundary(r) { set({ cameraBoundary: r }); },
      focusOn(id) { set({ focusRequest: { id, n: (get().focusRequest?.n ?? 0) + 1 } }); },
      playFrom(id) {
        const el = get().elements.find((e) => e.id === id);
        if (!el) return;
        set({ currentTime: el.startTime, isPlaying: true, cameraView: true, selectedId: null });
      },

      addAudioClip(clip) {
        commit(set, get, get().elements, { audioClips: [...get().audioClips, clip], selectedId: `clip:${clip.id}` });
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
        commit(set, get, get().elements, { audioClips: [...get().audioClips, copy], selectedId: `clip:${copy.id}` });
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
        });
      },

      loadDocument(doc) {
        set({ project: doc.project, isPlaying: false, currentTime: 0, selectedId: null, cameraView: false });
        commit(set, get, doc.elements, { audioClips: doc.audioClips, project: doc.project });
      },

      newProject() {
        set({ isPlaying: false, currentTime: 0, selectedId: null, cameraView: false });
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
