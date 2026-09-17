// Text → SVG paths via opentype.js (spec §10). The fonts are bundled inline
// (data: URLs) so adding text never depends on a network request; each glyph
// becomes its own path so text draws letter by letter.

import * as opentype from 'opentype.js';
import caveatUrl from '../assets/fonts/Caveat.ttf?inline';
import shadowsUrl from '../assets/fonts/ShadowsIntoLight.ttf?inline';
import interUrl from '../assets/fonts/Inter.ttf?inline';

export interface FontDef {
  id: string;
  label: string;
  url: string; // data: URL
}

export const FONTS: FontDef[] = [
  { id: 'caveat', label: 'Caveat (handwritten)', url: caveatUrl },
  { id: 'shadows', label: 'Shadows Into Light (marker)', url: shadowsUrl },
  { id: 'inter', label: 'Inter (clean sans)', url: interUrl },
];

export const DEFAULT_FONT_ID = 'caveat';
export const DEFAULT_FONT_SIZE = 140;

const fontCache = new Map<string, opentype.Font>();

function dataUrlToBuffer(url: string): ArrayBuffer {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function loadFont(fontId: string): Promise<opentype.Font> {
  const def = FONTS.find((f) => f.id === fontId) ?? FONTS[0];
  let font = fontCache.get(def.id);
  if (!font) {
    try {
      font = opentype.parse(dataUrlToBuffer(def.url));
    } catch (e) {
      return Promise.reject(new Error(`Could not read the font "${def.label}": ${e instanceof Error ? e.message : e}`));
    }
    fontCache.set(def.id, font);
  }
  return Promise.resolve(font);
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
