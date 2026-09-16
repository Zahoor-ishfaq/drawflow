// Bundled illustration library (public/library, built by a script — see
// CREDITS.md): OpenMoji line-art glyphs + Open Doodles sketch people.
// The index is fetched lazily; artwork is fetched when added to the canvas.

export interface LibraryEntry {
  id: string;
  name: string;
  category: string;
  tags: string[];
  src: string;
}

export const LIBRARY_CATEGORIES = [
  'Sketch people',
  'People',
  'Faces',
  'Objects',
  'Technology',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Health & Safety',
  'Symbols & Arrows',
] as const;

let indexPromise: Promise<LibraryEntry[]> | null = null;

export function loadLibraryIndex(): Promise<LibraryEntry[]> {
  if (!indexPromise) {
    indexPromise = fetch('/library/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Library index unavailable (${r.status})`);
        return r.json() as Promise<LibraryEntry[]>;
      })
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

const svgCache = new Map<string, Promise<string>>();

export function loadLibrarySvg(src: string): Promise<string> {
  let p = svgCache.get(src);
  if (!p) {
    p = fetch(src).then((r) => {
      if (!r.ok) throw new Error(`Could not load artwork (${r.status})`);
      return r.text();
    });
    svgCache.set(src, p);
    p.catch(() => svgCache.delete(src));
  }
  return p;
}

export function searchLibrary(entries: LibraryEntry[], query: string, category: string | null): LibraryEntry[] {
  const q = query.trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  return entries.filter((e) => {
    if (category && e.category !== category) return false;
    if (words.length === 0) return true;
    const hay = `${e.name} ${e.tags.join(' ')} ${e.category}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
