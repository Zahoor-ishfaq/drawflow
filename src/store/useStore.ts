import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore as useZustandStore } from 'zustand';
import type { AudioTrack, DrawElement, Project } from '../types';
import { clamp } from '../lib/time';
import { END_ZOOM_SECONDS } from '../lib/camera';

export interface AppState {
  project: Project;
  elements: DrawElement[];
  audio: AudioTrack | null;

  // playback
  currentTime: number;
  isPlaying: boolean;
  /** show the camera's view (what the video will show) instead of the whole artboard */
  cameraView: boolean;

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
  setAudio(track: AudioTrack | null): void;
  updateAudio(patch: Partial<AudioTrack>): void;
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
  zoomAtEnd: true,
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

function computeDuration(elements: DrawElement[], audio: AudioTrack | null, project: Project): number {
  let end = contentEnd(elements);
  if (elements.length > 0) {
    if (project.zoomAtEnd) end += END_ZOOM_SECONDS;
    end += project.endHold;
  }
  if (audio) end = Math.max(end, audio.startTime + Math.max(0, audio.duration - audio.trimStart - audio.trimEnd));
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
  const audio = 'audio' in extra ? (extra.audio as AudioTrack | null) : get().audio;
  const chained = rechain(elements);
  set({
    ...extra,
    elements: chained,
    project: { ...project, duration: computeDuration(chained, audio, project) },
  });
  return chained;
}

export const useStore = create<AppState>()(
  temporal(
    (set, get) => ({
      project: DEFAULT_PROJECT,
      elements: [],
      audio: null,
      currentTime: 0,
      isPlaying: false,
      cameraView: false,
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
        const order = sequenceOrder(get().elements);
        const from = order.findIndex((e) => e.id === id);
        if (from === -1) return;
        const to = clamp(Math.round(newIndex), 0, order.length - 1);
        if (from === to) return;
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved);
        commit(set, get, order.map((el, i) => ({ ...el, zIndex: i })));
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

      setAudio(track) {
        commit(set, get, get().elements, { audio: track });
      },

      updateAudio(patch) {
        const { audio } = get();
        if (!audio) return;
        commit(set, get, get().elements, { audio: { ...audio, ...patch } });
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
      partialize: (s) => ({ elements: s.elements, audio: s.audio, project: s.project }),
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
