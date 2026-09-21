// Favourites and recently-used assets (library ids and upload ids), kept in
// localStorage with a tiny subscription so every panel stays in sync.

import { useSyncExternalStore } from 'react';

const KEY = 'drawflow.assets';
const MAX_RECENT = 24;

interface Prefs { favorites: string[]; recent: string[]; /** prefer coloured library pictures */ color: boolean }

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      return { favorites: p.favorites ?? [], recent: p.recent ?? [], color: p.color ?? false };
    }
  } catch { /* ignore */ }
  return { favorites: [], recent: [], color: false };
}

let prefs: Prefs = load();
const listeners = new Set<() => void>();
function commit(next: Prefs): void {
  prefs = next;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* quota */ }
  listeners.forEach((l) => l());
}

export function useAssetPrefs(): Prefs {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => prefs);
}

export function isFavorite(id: string): boolean {
  return prefs.favorites.includes(id);
}

export function toggleFavorite(id: string): void {
  commit({
    ...prefs,
    favorites: prefs.favorites.includes(id) ? prefs.favorites.filter((x) => x !== id) : [id, ...prefs.favorites],
  });
}

export function setColorPictures(color: boolean): void {
  commit({ ...prefs, color });
}

export function noteUsed(id: string): void {
  commit({ ...prefs, recent: [id, ...prefs.recent.filter((x) => x !== id)].slice(0, MAX_RECENT) });
}

export function forgetAsset(id: string): void {
  commit({ ...prefs, favorites: prefs.favorites.filter((x) => x !== id), recent: prefs.recent.filter((x) => x !== id) });
}
