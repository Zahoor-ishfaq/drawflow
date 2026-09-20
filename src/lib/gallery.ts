// Persistent "My uploads" gallery in IndexedDB — uploads stay until the user
// deletes them (localStorage is too small for pictures).

import { useCallback, useEffect, useState } from 'react';

export interface GalleryItem {
  id: string;
  name: string;
  kind: 'svg' | 'image';
  /** SVG source text, or a data: URL for raster images */
  data: string;
  width: number;
  height: number;
  addedAt: number;
  tags?: string[];
}

import { dbTx } from './db';

const STORE = 'gallery';
const tx = <T,>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => dbTx<T>(STORE, mode, run);

export async function listGallery(): Promise<GalleryItem[]> {
  try {
    const items = await tx<GalleryItem[]>('readonly', (s) => s.getAll());
    return items.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export function saveGalleryItem(item: GalleryItem): Promise<unknown> {
  return tx('readwrite', (s) => s.put(item));
}

export function deleteGalleryItem(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id));
}

// --- tiny subscription so every panel instance sees the same list ---------

let cache: GalleryItem[] | null = null;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

export function useGallery() {
  const [items, setItems] = useState<GalleryItem[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    const sync = () => setItems(cache ?? []);
    listeners.add(sync);
    if (cache === null) {
      listGallery().then((list) => {
        cache = list;
        setLoading(false);
        notify();
      });
    }
    return () => { listeners.delete(sync); };
  }, []);

  const add = useCallback(async (item: GalleryItem) => {
    await saveGalleryItem(item);
    cache = [item, ...(cache ?? []).filter((i) => i.id !== item.id)];
    notify();
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteGalleryItem(id);
    cache = (cache ?? []).filter((i) => i.id !== id);
    notify();
  }, []);

  const update = useCallback(async (id: string, patch: Partial<GalleryItem>) => {
    const cur = (cache ?? []).find((i) => i.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await saveGalleryItem(next);
    cache = (cache ?? []).map((i) => (i.id === id ? next : i));
    notify();
  }, []);

  return { items, loading, add, remove, update };
}
