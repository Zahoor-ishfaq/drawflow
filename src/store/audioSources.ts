// Decoded audio sources live outside the undo history (AudioBuffers are big
// and immutable). Clips in the main store reference them by id.

import { useSyncExternalStore } from 'react';
import type { AudioSource } from '../types';

let sources = new Map<string, AudioSource>();
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

export function getSource(id: string): AudioSource | undefined {
  return sources.get(id);
}

export function allSources(): AudioSource[] {
  return [...sources.values()];
}

export function putSource(src: AudioSource): void {
  sources = new Map(sources).set(src.id, src);
  notify();
}

export function removeSource(id: string): void {
  if (!sources.has(id)) return;
  sources = new Map(sources);
  sources.delete(id);
  notify();
}

export function clearSources(): void {
  sources = new Map();
  notify();
}

export function useAudioSource(id: string | null | undefined): AudioSource | undefined {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => (id ? sources.get(id) : undefined),
  );
}

let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function decodeToSource(blob: Blob, name: string, id: string = crypto.randomUUID()): Promise<AudioSource> {
  const buf = await blob.arrayBuffer();
  const buffer = await audioContext().decodeAudioData(buf);
  const src: AudioSource = { id, name, blob, buffer, duration: buffer.duration };
  putSource(src);
  return src;
}
