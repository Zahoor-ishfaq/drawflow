// Text → SVG paths via opentype.js (spec §10). Fonts are fetched once and
// cached; each glyph becomes its own path so text draws letter by letter.

import * as opentype from 'opentype.js';

export interface FontDef {
  id: string;
  label: string;
  url: string;
}

export const FONTS: FontDef[] = [
  { id: 'caveat', label: 'Caveat (handwritten)', url: '/fonts/Caveat.ttf' },
  { id: 'inter', label: 'Inter (sans)', url: '/fonts/Inter.ttf' },
];

export const DEFAULT_FONT_ID = 'caveat';
export const DEFAULT_FONT_SIZE = 140;

const fontCache = new Map<string, Promise<opentype.Font>>();

export function loadFont(fontId: string): Promise<opentype.Font> {
  const def = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  let cached = fontCache.get(def.id);
  if (!cached) {
    cached = fetch(def.url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load font "${def.label}" (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => opentype.parse(buf));
    fontCache.set(def.id, cached);
    cached.catch(() => fontCache.delete(def.id));
  }
  return cached;
}

/** One 'd' string per glyph; multi-line via \n with 1.25em line spacing. */
export async function textToPaths(
  text: string,
  fontId: string,
  fontSize: number,
): Promise<string[]> {
  const font = await loadFont(fontId);
  const out: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const glyphPaths = font.getPaths(line, 0, (i + 1) * fontSize * 1.25, fontSize);
    for (const p of glyphPaths) {
      const d = p.toPathData(2);
      if (d) out.push(d); // spaces produce empty paths — drop them
    }
  });
  return out;
}
