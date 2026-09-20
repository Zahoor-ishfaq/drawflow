// Local projects: every project (elements, audio clips, audio bytes, a
// thumbnail) lives in IndexedDB and is checkpointed shortly after each
// change. Versions are kept every few minutes for "version history",
// templates are projects saved without their identity, and any project can
// be written to / read from a single .drawflow.json file.

import { useSyncExternalStore } from 'react';
import { useStore, DEFAULT_PROJECT } from '../store/useStore';
import { allSources, clearSources, decodeToSource, getSource } from '../store/audioSources';
import type { AudioClip, DrawElement, Project } from '../types';
import { makeRenderContext, svgStringForTime } from './renderFrame';
import { allHands } from '../assets/hands';
import { validateDocument } from './validate';
import { dbTx } from './db';

const STORE = 'projects';
const VERSIONS = 'versions';
const TEMPLATES = 'templates';
const CURRENT_KEY = 'drawflow.currentProject';
export const FORMAT = 2;
const VERSION_EVERY_MS = 3 * 60 * 1000;
const MAX_VERSIONS = 25;

interface SavedSource { id: string; name: string; type: string; blob: Blob }
export interface SavedDoc {
  id: string;
  format: number;
  savedAt: number;
  createdAt: number;
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];
  sources: SavedSource[];
  thumbnail?: string; // small JPEG data URL
}
export interface ProjectSummary {
  id: string;
  name: string;
  savedAt: number;
  createdAt: number;
  thumbnail?: string;
  elementCount: number;
  duration: number;
}
export interface SavedVersion {
  id: string;
  projectId: string;
  savedAt: number;
  label: string;
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];
  thumbnail?: string;
}
export interface SavedTemplate {
  id: string;
  name: string;
  description: string;
  savedAt: number;
  kind: 'project' | 'scene';
  project: Project;
  elements: DrawElement[];
  thumbnail?: string;
  builtIn?: boolean;
}

const tx = dbTx;

// --- current project id ------------------------------------------------------
let currentId: string = (() => {
  try { return localStorage.getItem(CURRENT_KEY) || crypto.randomUUID(); } catch { return crypto.randomUUID(); }
})();
let createdAt = Date.now();
function setCurrentId(id: string, created?: number): void {
  currentId = id;
  createdAt = created ?? Date.now();
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function currentProjectId(): string { return currentId; }

// --- status shown in the top bar -------------------------------------------
export type SaveStatus = { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; at: number | null; message?: string };
let status: SaveStatus = { state: 'idle', at: null };
const listeners = new Set<() => void>();
function setStatus(next: SaveStatus) { status = next; listeners.forEach((l) => l()); }
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => status);
}
export function useCurrentProjectId(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => currentId);
}

// --- thumbnails --------------------------------------------------------------

/** Small JPEG of the finished scribe (last frame before the end hold). */
export async function renderThumbnail(project: Project, elements: DrawElement[], width = 320): Promise<string | undefined> {
  if (elements.length === 0) return undefined;
  try {
    const ctx = makeRenderContext(project, elements);
    const handImages: Record<string, string> = {};
    for (const h of allHands(project)) handImages[h.id] = h.src;
    const t = Math.max(0, project.duration - project.endHold - 0.01);
    const h = Math.round((width * project.height) / project.width);
    const svg = svgStringForTime(ctx, t, width, h, handImages);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = width; c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = project.background;
      g.fillRect(0, 0, width, h);
      g.drawImage(img, 0, 0, width, h);
      return c.toDataURL('image/jpeg', 0.72);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return undefined;
  }
}

function snapshot(thumbnail?: string): SavedDoc {
  const s = useStore.getState();
  const used = new Set(s.audioClips.map((c) => c.sourceId));
  return {
    id: currentId,
    format: FORMAT,
    savedAt: Date.now(),
    createdAt,
    project: s.project,
    elements: s.elements,
    audioClips: s.audioClips,
    sources: allSources().filter((src) => used.has(src.id)).map((src) => ({ id: src.id, name: src.name, type: src.blob.type, blob: src.blob })),
    thumbnail,
  };
}

let lastVersionAt = 0;

export async function saveNow(): Promise<void> {
  setStatus({ ...status, state: 'saving' });
  try {
    const s = useStore.getState();
    const thumbnail = await renderThumbnail(s.project, s.elements);
    const doc = snapshot(thumbnail);
    await tx(STORE, 'readwrite', (st) => st.put(doc));
    setStatus({ state: 'saved', at: Date.now() });
    if (doc.elements.length > 0 && Date.now() - lastVersionAt > VERSION_EVERY_MS) {
      lastVersionAt = Date.now();
      await pushVersion(doc, 'Autosave');
    }
  } catch (e) {
    setStatus({ state: 'error', at: status.at, message: e instanceof Error ? e.message : 'Could not save' });
  }
}

async function pushVersion(doc: SavedDoc, label: string): Promise<void> {
  const v: SavedVersion = {
    id: crypto.randomUUID(), projectId: doc.id, savedAt: doc.savedAt, label,
    project: doc.project, elements: doc.elements, audioClips: doc.audioClips, thumbnail: doc.thumbnail,
  };
  await tx(VERSIONS, 'readwrite', (st) => st.put(v));
  // trim old ones
  const all = await listVersions(doc.id);
  for (const old of all.slice(MAX_VERSIONS)) await tx(VERSIONS, 'readwrite', (st) => st.delete(old.id));
}

/** Manual snapshot ("Save version" in the menu). */
export async function saveVersion(label: string): Promise<void> {
  const s = useStore.getState();
  const thumbnail = await renderThumbnail(s.project, s.elements);
  await tx(STORE, 'readwrite', (st) => st.put(snapshot(thumbnail)));
  await pushVersion(snapshot(thumbnail), label);
  lastVersionAt = Date.now();
}

export async function listVersions(projectId: string): Promise<SavedVersion[]> {
  try {
    const all = await tx<SavedVersion[]>(VERSIONS, 'readonly', (st) => st.index('projectId').getAll(projectId));
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function restoreVersion(versionId: string): Promise<void> {
  const v = await tx<SavedVersion | undefined>(VERSIONS, 'readonly', (st) => st.get(versionId));
  if (!v) return;
  // audio sources that still exist keep playing; clips whose source is gone are dropped
  const clips = v.audioClips.filter((c) => getSource(c.sourceId));
  useStore.getState().loadDocument(validateDocument({ project: v.project, elements: v.elements, audioClips: clips }).doc);
  await saveNow();
}

// --- restore / open / list ---------------------------------------------------

/** Restore the current project (or the most recent one). Returns true when something was loaded. */
export async function restoreLast(): Promise<boolean> {
  let doc: SavedDoc | undefined;
  try {
    doc = await tx<SavedDoc | undefined>(STORE, 'readonly', (st) => st.get(currentId));
    if (!doc) {
      // migration from the single-checkpoint era, or pick the newest project
      const all = await tx<SavedDoc[]>(STORE, 'readonly', (st) => st.getAll());
      doc = all.find((d) => d.id === 'current') ?? all.sort((a, b) => b.savedAt - a.savedAt)[0];
      if (doc?.id === 'current') {
        const migrated = { ...doc, id: crypto.randomUUID(), createdAt: doc.savedAt };
        await tx(STORE, 'readwrite', (st) => st.put(migrated));
        await tx(STORE, 'readwrite', (st) => st.delete('current'));
        doc = migrated;
      }
    }
  } catch {
    return false;
  }
  if (!doc) return false;
  await applyDoc(doc);
  setCurrentId(doc.id, doc.createdAt);
  setStatus({ state: 'saved', at: doc.savedAt });
  return true;
}

async function applyDoc(doc: Pick<SavedDoc, 'project' | 'elements' | 'audioClips' | 'sources'>): Promise<void> {
  clearSources();
  const ok = new Set<string>();
  for (const src of doc.sources ?? []) {
    try {
      await decodeToSource(src.blob, src.name, src.id);
      ok.add(src.id);
    } catch { /* skip undecodable audio */ }
  }
  const { doc: clean } = validateDocument({
    project: doc.project,
    elements: doc.elements,
    audioClips: (doc.audioClips ?? []).filter((c) => ok.has(c.sourceId)),
  });
  useStore.getState().loadDocument(clean);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const all = await tx<SavedDoc[]>(STORE, 'readonly', (st) => st.getAll());
    return all
      .map((d) => ({ id: d.id, name: d.project?.name ?? 'Untitled', savedAt: d.savedAt, createdAt: d.createdAt ?? d.savedAt, thumbnail: d.thumbnail, elementCount: d.elements?.length ?? 0, duration: d.project?.duration ?? 0 }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function openProject(id: string): Promise<boolean> {
  if (id === currentId) return true;
  if (status.state === 'dirty') await saveNow();
  const doc = await tx<SavedDoc | undefined>(STORE, 'readonly', (st) => st.get(id));
  if (!doc) return false;
  await applyDoc(doc);
  setCurrentId(doc.id, doc.createdAt);
  setStatus({ state: 'saved', at: doc.savedAt });
  return true;
}

export async function deleteProject(id: string): Promise<void> {
  await tx(STORE, 'readwrite', (st) => st.delete(id));
  for (const v of await listVersions(id)) await tx(VERSIONS, 'readwrite', (st) => st.delete(v.id));
  if (id === currentId) await newProject();
}

export async function duplicateProject(id: string): Promise<string | null> {
  const doc = await tx<SavedDoc | undefined>(STORE, 'readonly', (st) => st.get(id));
  if (!doc) return null;
  const copy: SavedDoc = { ...doc, id: crypto.randomUUID(), createdAt: Date.now(), savedAt: Date.now(), project: { ...doc.project, name: `${doc.project.name} copy` } };
  await tx(STORE, 'readwrite', (st) => st.put(copy));
  return copy.id;
}

/** Start a fresh project (the old one stays in the list). */
export async function newProject(from?: { project: Project; elements: DrawElement[] }, name?: string): Promise<void> {
  if (status.state === 'dirty') await saveNow();
  clearSources();
  setCurrentId(crypto.randomUUID());
  if (from) {
    const elements = from.elements.map((e) => ({ ...e, id: crypto.randomUUID() }));
    // scene ids are shared between project.scenes and elements — remap both
    const sceneMap = new Map((from.project.scenes ?? []).map((sc) => [sc.id, crypto.randomUUID()]));
    const scenes = (from.project.scenes ?? []).map((sc) => ({ ...sc, id: sceneMap.get(sc.id)! }));
    useStore.getState().loadDocument({
      project: { ...DEFAULT_PROJECT, ...from.project, name: name ?? from.project.name, scenes, markers: [] },
      elements: elements.map((e) => ({ ...e, sceneId: e.sceneId ? sceneMap.get(e.sceneId) : undefined })),
      audioClips: [],
    });
  } else {
    useStore.getState().newProject();
    if (name) useStore.getState().updateProject({ name });
  }
  setStatus({ state: 'idle', at: null });
  await saveNow();
}

/** Autosave: debounce document changes into a checkpoint. */
export function startAutosave(): () => void {
  let timer = 0;
  const unsub = useStore.subscribe((s, prev) => {
    if (s.elements === prev.elements && s.project === prev.project && s.audioClips === prev.audioClips) return;
    if (status.state !== 'saving') setStatus({ ...status, state: 'dirty' });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });
  const flush = () => { if (status.state === 'dirty') void saveNow(); };
  window.addEventListener('beforeunload', flush);
  return () => { unsub(); window.removeEventListener('beforeunload', flush); window.clearTimeout(timer); };
}

export async function clearCheckpoint(): Promise<void> {
  try { await tx(STORE, 'readwrite', (st) => st.delete(currentId)); } catch { /* noop */ }
  setStatus({ state: 'idle', at: null });
}

// --- templates ---------------------------------------------------------------

export async function listTemplates(): Promise<SavedTemplate[]> {
  try {
    const all = await tx<SavedTemplate[]>(TEMPLATES, 'readonly', (st) => st.getAll());
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveTemplate(name: string, description: string, kind: 'project' | 'scene', elements: DrawElement[]): Promise<void> {
  const s = useStore.getState();
  const project = { ...s.project, name };
  const thumbnail = await renderThumbnail(project, elements);
  const t: SavedTemplate = { id: crypto.randomUUID(), name, description, savedAt: Date.now(), kind, project, elements, thumbnail };
  await tx(TEMPLATES, 'readwrite', (st) => st.put(t));
}

export async function deleteTemplate(id: string): Promise<void> {
  await tx(TEMPLATES, 'readwrite', (st) => st.delete(id));
}

/** Append a scene template's elements as a new scene of the current project. */
export function insertSceneTemplate(t: SavedTemplate): void {
  const s = useStore.getState();
  const scene = s.addScene(t.name);
  const base = s.elements.reduce((m, e) => Math.max(m, e.zIndex), -1);
  const src = [...t.elements].sort((a, b) => a.zIndex - b.zIndex);
  src.forEach((e, i) => s.addElement({ ...e, id: crypto.randomUUID(), zIndex: base + 1 + i, sceneId: scene.id }));
}

// --- project files ----------------------------------------------------------

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function exportProjectFile(): Promise<{ blob: Blob; filename: string }> {
  const doc = snapshot();
  const sources = await Promise.all(doc.sources.map(async (s) => ({ id: s.id, name: s.name, type: s.type, data: await blobToDataUrl(s.blob) })));
  const json = JSON.stringify({ app: 'drawflow', format: FORMAT, savedAt: doc.savedAt, project: doc.project, elements: doc.elements, audioClips: doc.audioClips, sources }, null, 1);
  const safe = doc.project.name.replace(/[^\w\- ]+/g, '').trim() || 'drawflow';
  return { blob: new Blob([json], { type: 'application/json' }), filename: `${safe}.drawflow.json` };
}

/** Parse a .drawflow.json without loading it (used by the CLI/renderer and the validator UI). */
export async function parseProjectFile(text: string): Promise<{ project: Project; elements: DrawElement[]; audioClips: AudioClip[]; sources: SavedSource[]; problems: string[] }> {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'drawflow' || !Array.isArray(parsed.elements)) throw new Error('Not a DrawFlow project file.');
  const sources: SavedSource[] = await Promise.all(
    (parsed.sources ?? []).map(async (s: { id: string; name: string; type: string; data: string }) => ({
      id: s.id, name: s.name, type: s.type, blob: await dataUrlToBlob(s.data),
    })),
  );
  const { doc, problems } = validateDocument({ project: parsed.project, elements: parsed.elements, audioClips: parsed.audioClips ?? [] });
  return { ...doc, sources, problems };
}

/** Open a file as a new project (the current one stays in the list). */
export async function importProjectFile(file: File): Promise<string[]> {
  const parsed = await parseProjectFile(await file.text());
  if (status.state === 'dirty') await saveNow();
  setCurrentId(crypto.randomUUID());
  await applyDoc(parsed);
  await saveNow();
  return parsed.problems;
}
