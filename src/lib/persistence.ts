// Local checkpoints: the whole document (project, elements, audio clips and
// the audio bytes they reference) is written to IndexedDB shortly after every
// change and restored on the next visit. A project can also be saved to /
// opened from a single .drawflow.json file.

import { useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore';
import { allSources, clearSources, decodeToSource } from '../store/audioSources';
import type { AudioClip, DrawElement, Project } from '../types';

const DB_NAME = 'drawflow';
const STORE = 'projects';
const DOC_ID = 'current';
const FORMAT = 1;

interface SavedSource { id: string; name: string; type: string; blob: Blob }
interface SavedDoc {
  id: string;
  format: number;
  savedAt: number;
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];
  sources: SavedSource[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('gallery')) db.createObjectStore('gallery', { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

// --- status shown in the top bar -------------------------------------------
export type SaveStatus = { state: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; at: number | null; message?: string };
let status: SaveStatus = { state: 'idle', at: null };
const listeners = new Set<() => void>();
function setStatus(next: SaveStatus) { status = next; listeners.forEach((l) => l()); }
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => status);
}

function snapshot(): SavedDoc {
  const s = useStore.getState();
  const used = new Set(s.audioClips.map((c) => c.sourceId));
  return {
    id: DOC_ID,
    format: FORMAT,
    savedAt: Date.now(),
    project: s.project,
    elements: s.elements,
    audioClips: s.audioClips,
    sources: allSources().filter((src) => used.has(src.id)).map((src) => ({ id: src.id, name: src.name, type: src.blob.type, blob: src.blob })),
  };
}

export async function saveNow(): Promise<void> {
  setStatus({ ...status, state: 'saving' });
  try {
    await tx('readwrite', (st) => st.put(snapshot()));
    setStatus({ state: 'saved', at: Date.now() });
  } catch (e) {
    setStatus({ state: 'error', at: status.at, message: e instanceof Error ? e.message : 'Could not save' });
  }
}

/** Restore the last checkpoint, if any. Returns true when something was loaded. */
export async function restoreLast(): Promise<boolean> {
  let doc: SavedDoc | undefined;
  try {
    doc = await tx<SavedDoc | undefined>('readonly', (st) => st.get(DOC_ID));
  } catch {
    return false;
  }
  if (!doc || doc.format !== FORMAT) return false;
  await applyDoc(doc);
  setStatus({ state: 'saved', at: doc.savedAt });
  return true;
}

async function applyDoc(doc: Omit<SavedDoc, 'id' | 'format' | 'savedAt'>): Promise<void> {
  clearSources();
  const ok = new Set<string>();
  for (const src of doc.sources) {
    try {
      await decodeToSource(src.blob, src.name, src.id);
      ok.add(src.id);
    } catch { /* skip undecodable audio */ }
  }
  useStore.getState().loadDocument({
    project: doc.project,
    elements: doc.elements,
    audioClips: doc.audioClips.filter((c) => ok.has(c.sourceId)),
  });
}

export async function clearCheckpoint(): Promise<void> {
  try { await tx('readwrite', (st) => st.delete(DOC_ID)); } catch { /* noop */ }
  setStatus({ state: 'idle', at: null });
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
  const json = JSON.stringify({ app: 'drawflow', format: FORMAT, savedAt: doc.savedAt, project: doc.project, elements: doc.elements, audioClips: doc.audioClips, sources });
  const safe = doc.project.name.replace(/[^\w\- ]+/g, '').trim() || 'drawflow';
  return { blob: new Blob([json], { type: 'application/json' }), filename: `${safe}.drawflow.json` };
}

export async function importProjectFile(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'drawflow' || !Array.isArray(parsed.elements)) throw new Error('Not a DrawFlow project file.');
  const sources: SavedSource[] = await Promise.all(
    (parsed.sources ?? []).map(async (s: { id: string; name: string; type: string; data: string }) => ({
      id: s.id, name: s.name, type: s.type, blob: await dataUrlToBlob(s.data),
    })),
  );
  await applyDoc({ project: parsed.project, elements: parsed.elements, audioClips: parsed.audioClips ?? [], sources });
  await saveNow();
}
