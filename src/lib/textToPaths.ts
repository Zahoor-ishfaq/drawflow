// Text → SVG paths via opentype.js (spec §10). The fonts are bundled inline
// (data: URLs) so adding text never depends on a network request; each glyph
// becomes its own path so text draws letter by letter. Users can add their
// own TTF/OTF fonts (kept in the project) for other scripts.

import * as opentype from 'opentype.js';
import caveatUrl from '../assets/fonts/Caveat.ttf?inline';
import shadowsUrl from '../assets/fonts/ShadowsIntoLight.ttf?inline';
import interUrl from '../assets/fonts/Inter.ttf?inline';
import type { CustomFont } from '../types';
import { transformPath } from './svgPath';

export interface FontDef {
  id: string;
  label: string;
  url: string; // data: URL
  custom?: boolean;
}

export const FONTS: FontDef[] = [
  { id: 'caveat', label: 'Caveat (handwritten)', url: caveatUrl },
  { id: 'shadows', label: 'Shadows Into Light (marker)', url: shadowsUrl },
  { id: 'inter', label: 'Inter (clean sans)', url: interUrl },
];

export const DEFAULT_FONT_ID = 'caveat';
export const DEFAULT_FONT_SIZE = 140;
export const CUSTOM_FONT_PREFIX = 'font:';

/** Built-in fonts plus the project's uploaded ones. */
export function allFonts(custom: CustomFont[] | undefined): FontDef[] {
  return [
    ...FONTS,
    ...(custom ?? []).map((f) => ({ id: `${CUSTOM_FONT_PREFIX}${f.id}`, label: `${f.name} (yours)`, url: f.data, custom: true })),
  ];
}

const fontCache = new Map<string, opentype.Font>();

function dataUrlToBuffer(url: string): ArrayBuffer {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function loadFont(fontId: string, custom?: CustomFont[]): Promise<opentype.Font> {
  const def = allFonts(custom).find((f) => f.id === fontId) ?? FONTS[0];
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

/** Parse an uploaded font file so it can be stored in the project. */
export async function readFontFile(file: File): Promise<CustomFont> {
  const buf = await file.arrayBuffer();
  const font = opentype.parse(buf); // throws on unsupported files (e.g. WOFF2)
  const name = (font.names.fullName?.en ?? font.names.fontFamily?.en ?? file.name.replace(/\.[^.]+$/, '')) as string;
  const b64 = btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(''));
  return { id: crypto.randomUUID(), name, data: `data:font/ttf;base64,${b64}` };
}

export interface TextOptions {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** multiple of the font size (default 1.25) */
  lineHeight?: number;
  /** em (default 0) */
  letterSpacing?: number;
  rtl?: boolean;
  customFonts?: CustomFont[];
}

/** Synthetic bold: extra stroke width in canvas px for a font size. */
export function boldStrokeWidth(fontSize: number): number {
  return Math.max(1, fontSize * 0.028);
}

const ITALIC_SKEW: [number, number, number, number, number, number] = [1, 0, -Math.tan((12 * Math.PI) / 180), 1, 0, 0];

/** Hebrew / Arabic / Syriac / Thaana ranges — enough to auto-detect direction
 * (built from code points so the source stays plain ASCII). */
const RTL_RANGE = new RegExp(
  `[${String.fromCharCode(0x0590)}-${String.fromCharCode(0x08ff)}` +
  `${String.fromCharCode(0xfb1d)}-${String.fromCharCode(0xfdff)}` +
  `${String.fromCharCode(0xfe70)}-${String.fromCharCode(0xfefe)}]`,
);
export function looksRtl(text: string): boolean {
  return RTL_RANGE.test(text);
}

/**
 * One 'd' string per glyph. Lines are split on \n; alignment, spacing,
 * italic skew and right-to-left ordering are baked into the paths.
 */
export async function textToPaths(
  text: string,
  fontId: string,
  fontSize: number,
  opts: TextOptions = {},
): Promise<string[]> {
  const font = await loadFont(fontId, opts.customFonts);
  const out: string[] = [];
  const lines = text.split('\n');
  const lineHeight = (opts.lineHeight ?? 1.25) * fontSize;
  const letterSpacing = opts.letterSpacing ?? 0;
  const render = { letterSpacing, kerning: true };
  const widths = lines.map((l) => (l.trim() ? font.getAdvanceWidth(opts.rtl ? reverseGraphemes(l) : l, fontSize, render) : 0));
  const maxW = Math.max(0, ...widths);

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const shaped = opts.rtl ? reverseGraphemes(line) : line;
    const align = opts.align ?? (opts.rtl ? 'right' : 'left');
    const x = align === 'left' ? 0 : align === 'center' ? (maxW - widths[i]) / 2 : maxW - widths[i];
    const glyphPaths = font.getPaths(shaped, x, (i + 1) * lineHeight, fontSize, render);
    for (const p of glyphPaths) {
      let d = p.toPathData(2);
      if (!d) continue; // spaces produce empty paths — drop them
      if (opts.italic) d = transformPath(d, ITALIC_SKEW);
      out.push(d);
    }
  });
  return out;
}

/** Reverse a line for right-to-left display, keeping combining marks attached. */
function reverseGraphemes(line: string): string {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new (Intl as unknown as { Segmenter: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter('und', { granularity: 'grapheme' }).segment(line), (s) => s.segment)
    : Array.from(line);
  // numbers and Latin runs stay left-to-right inside an RTL line
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length) { out.push(...run); run = []; } };
  for (const g of seg.reverse()) {
    if (/[0-9A-Za-z]/.test(g)) run.unshift(g);
    else { flush(); out.push(g); }
  }
  flush();
  return out.join('');
}
