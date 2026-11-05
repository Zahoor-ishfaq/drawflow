// Paints a subtitle to a small canvas that every renderer then places on the
// frame, so the live preview and both export paths show exactly the same
// picture. It uses the browser's text engine rather than the handwriting
// paths: subtitles need whatever the narration is written in, and the system
// fonts cover Chinese, Japanese, Arabic and more, which the built-in fonts don't.

import type { Project, SubtitleSettings } from '../types';
import type { RenderContext } from './renderFrame';
import { cueAt } from './subtitles';
import { FONTS } from './textToPaths';

export interface SubtitleSprite {
  canvas: HTMLCanvasElement;
  /** position and size, as fractions of the frame */
  x: number;
  y: number;
  width: number;
  height: number;
  /** the picture as a data: URL, for SVG rendering */
  url(): string;
}

/** Fonts offered in the panel. Windows names first: the fallback list below covers the rest. */
export const SUBTITLE_FONTS = ['Arial', 'Inter', 'Verdana', 'Georgia', 'Times New Roman', 'Microsoft YaHei', 'SimHei', 'KaiTi', 'Caveat', 'Shadows Into Light'];

const FALLBACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Segoe UI", sans-serif';
const fontCss = (font: string, px: number) => `600 ${px}px "${font.replace(/"/g, '')}", ${FALLBACK}`;

const FRAME_MARGIN = 0.06;
const MAX_WIDTH = 0.86;
const cache = new Map<string, SubtitleSprite>();
const loaded = new Set<string>();

export function clearSubtitleSprites(): void { cache.clear(); }

/** Load a font that isn't installed on the system (the bundled ones and the project's own). */
export async function prepareSubtitleFont(settings: SubtitleSettings | undefined, project?: Pick<Project, 'fonts'>): Promise<void> {
  const font = settings?.font;
  if (!font || loaded.has(font) || typeof document === 'undefined') return;
  const bundled = FONTS.find((f) => f.label.startsWith(font))?.url;
  const own = project?.fonts?.find((f) => f.name === font)?.data;
  const url = bundled ?? own;
  try {
    if (url) {
      const face = new FontFace(font, `url(${url})`);
      await face.load();
      document.fonts.add(face);
    }
    await document.fonts.load(`600 40px "${font}"`);
    loaded.add(font);
    clearSubtitleSprites();
  } catch { /* a font that can't load falls back to the system's */ }
}

/** Words stay whole; a character of a script without spaces is its own piece, and keeps the punctuation
 * after it, because a row must not start with a comma or a full stop. */
const CJK = '\\u2E80-\\uD7A3\\uF900-\\uFAFF\\uFF00-\\uFFEF';
const CLOSERS = ',.!?;:)\\]}\\u3001\\u3002\\uFF0C\\uFF0E\\uFF01\\uFF1F\\uFF1B\\uFF1A\\uFF09\\u300B\\u300D\\u300F\\u3011\\u3009\\u201D\\u2019\\u2026';
const TOKENS = new RegExp(`[${CJK}][${CLOSERS}]*|[^\\s${CJK}]+\\s*|\\s+`, 'g');

/** Break text into rows that fit. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const rows: string[] = [];
  for (const line of text.split('\n')) {
    let cur = '';
    for (const token of line.match(TOKENS) ?? []) {
      if (cur && ctx.measureText((cur + token).trimEnd()).width > width) { rows.push(cur.trimEnd()); cur = token.trimStart(); }
      else cur += token;
    }
    if (cur.trim()) rows.push(cur.trimEnd());
  }
  return rows;
}

export function subtitleSprite(text: string, s: SubtitleSettings, W: number, H: number): SubtitleSprite {
  const key = [W, H, s.font, s.size, s.position, s.color, s.box, text].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  // sized against the short side, so vertical videos get readable text too
  const px = Math.max(8, Math.round(s.size * (Math.min(W, H) / 1080)));
  const padX = Math.round(px * 0.55), padY = Math.round(px * 0.3), lineH = Math.round(px * 1.28);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = fontCss(s.font, px);
  const rows = wrap(ctx, text, W * MAX_WIDTH - padX * 2);
  const textW = Math.max(...rows.map((r) => ctx.measureText(r).width));
  canvas.width = Math.ceil(Math.min(W, textW + padX * 2));
  canvas.height = Math.ceil(rows.length * lineH + padY * 2);

  ctx.font = fontCss(s.font, px); // resizing a canvas resets it
  if (s.box) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, px * 0.28);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  rows.forEach((row, i) => {
    const x = canvas.width / 2, y = padY + lineH * (i + 0.5);
    if (!s.box) { // no band: an outline keeps the words readable on any paper
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = Math.max(2, px * 0.14);
      ctx.strokeText(row, x, y);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(row, x, y);
  });

  const height = canvas.height / H;
  const y = s.position === 'top' ? FRAME_MARGIN : s.position === 'middle' ? (1 - height) / 2 : 1 - FRAME_MARGIN - height;
  let url: string | null = null;
  const sprite: SubtitleSprite = {
    canvas, x: (W - canvas.width) / 2 / W, y, width: canvas.width / W, height,
    url: () => (url ??= canvas.toDataURL('image/png')),
  };
  if (cache.size > 96) cache.delete(cache.keys().next().value as string);
  cache.set(key, sprite);
  return sprite;
}

/** The subtitle on screen at time t, sized for a W × H frame. */
export function subtitleSpriteAt(ctx: RenderContext, t: number, W: number, H: number): SubtitleSprite | null {
  if (!ctx.subtitles) return null;
  const cue = cueAt(ctx.cues, t);
  return cue ? subtitleSprite(cue.text, ctx.subtitles, W, H) : null;
}
