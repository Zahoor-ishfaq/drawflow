import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore as useZustandStore } from 'zustand';
import type { AudioTrack, DrawElement, HandStyle, Project } from '../types';
import { clamp } from '../lib/time';

export interface AppState {
  project: Project;
  elements: DrawElement[];
  audio: AudioTrack | null;

  // playback
  currentTime: number;
  isPlaying: boolean;

  // editing
  selectedId: string | null;
  handStyle: HandStyle;

  // export
  isExporting: boolean;
  exportProgress: number; // 0..1
  ffmpegReady: boolean;

  // actions
  addElement(partial: Partial<DrawElement> & Pick<DrawElement, 'kind' | 'paths'>): DrawElement;
  updateElement(id: string, patch: Partial<DrawElement>): void;
  removeElement(id: string): void;
  duplicateElement(id: string): void;
  reorder(id: string, newZIndex: number): void;
  select(id: string | null): void;
  setTime(t: number): void;
  play(): void;
  pause(): void;
  stop(): void;
  setAudio(track: AudioTrack | null): void;
  updateAudio(patch: Partial<AudioTrack>): void;
  setHandStyle(s: HandStyle): void;
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
  duration: 10,
};

const TAIL_SECONDS = 1;
const MIN_DURATION = 5;

function computeDuration(elements: DrawElement[], audio: AudioTrack | null): number {
  let end = 0;
  for (const el of elements) end = Math.max(end, el.startTime + el.drawDuration);
  if (audio?.buffer) end = Math.max(end, audio.startTime + audio.buffer.duration);
  return Math.max(MIN_DURATION, end + TAIL_SECONDS);
}

/** Reassign contiguous zIndexes 0..n-1 preserving order. */
function normalizeZ(elements: DrawElement[]): DrawElement[] {
  return [...elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((el, i) => (el.zIndex === i ? el : { ...el, zIndex: i }));
}

export const useStore = create<AppState>()(
  temporal(
    (set, get) => ({
      project: DEFAULT_PROJECT,
      elements: [],
      audio: null,
      currentTime: 0,
      isPlaying: false,
      selectedId: null,
      handStyle: 'marker',
      isExporting: false,
      exportProgress: 0,
      ffmpegReady: false,

      addElement(partial) {
        const { elements, project, audio } = get();
        const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
        const contentEnd = elements.reduce(
          (m, e) => Math.max(m, e.startTime + e.drawDuration), 0);
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
          startTime: contentEnd,
          drawDuration: 2,
          style: 'draw',
          zIndex: maxZ + 1,
          ...partial,
        };
        const next = [...elements, el];
        set({
          elements: next,
          selectedId: el.id,
          project: { ...project, duration: computeDuration(next, audio) },
        });
        return el;
      },

      updateElement(id, patch) {
        const { elements, project, audio } = get();
        const next = elements.map((e) => (e.id === id ? { ...e, ...patch } : e));
        set({
          elements: next,
          project: { ...project, duration: computeDuration(next, audio) },
        });
      },

      removeElement(id) {
        const { elements, project, audio, selectedId } = get();
        const next = normalizeZ(elements.filter((e) => e.id !== id));
        set({
          elements: next,
          selectedId: selectedId === id ? null : selectedId,
          project: { ...project, duration: computeDuration(next, audio) },
        });
      },

      duplicateElement(id) {
        const { elements, project, audio } = get();
        const src = elements.find((e) => e.id === id);
        if (!src) return;
        const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
        const copy: DrawElement = {
          ...src,
          id: crypto.randomUUID(),
          x: src.x + 40,
          y: src.y + 40,
          startTime: src.startTime + src.drawDuration,
          zIndex: maxZ + 1,
        };
        const next = [...elements, copy];
        set({
          elements: next,
          selectedId: copy.id,
          project: { ...project, duration: computeDuration(next, audio) },
        });
      },

      reorder(id, newZIndex) {
        const { elements } = get();
        const ordered = [...elements].sort((a, b) => a.zIndex - b.zIndex);
        const from = ordered.findIndex((e) => e.id === id);
        if (from === -1) return;
        const to = clamp(Math.round(newZIndex), 0, ordered.length - 1);
        if (from === to) return;
        const [moved] = ordered.splice(from, 1);
        ordered.splice(to, 0, moved);
        set({ elements: ordered.map((el, i) => ({ ...el, zIndex: i })) });
      },

      select(id) { set({ selectedId: id }); },

      setTime(t) {
        set({ currentTime: clamp(t, 0, get().project.duration) });
      },

      play() {
        const { currentTime, project } = get();
        // restart from the top if the playhead is parked at the end
        if (currentTime >= project.duration - 1e-6) set({ currentTime: 0 });
        set({ isPlaying: true });
      },
      pause() { set({ isPlaying: false }); },
      stop() { set({ isPlaying: false, currentTime: 0 }); },

      setAudio(track) {
        const { elements, project } = get();
        set({
          audio: track,
          project: { ...project, duration: computeDuration(elements, track) },
        });
      },

      updateAudio(patch) {
        const { audio, elements, project } = get();
        if (!audio) return;
        const next = { ...audio, ...patch };
        set({
          audio: next,
          project: { ...project, duration: computeDuration(elements, next) },
        });
      },

      setHandStyle(s) { set({ handStyle: s }); },

      updateProject(patch) {
        set({ project: { ...get().project, ...patch } });
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
