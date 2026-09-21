// The "understanding" half: the chosen text model turns a request into a
// small plan (library picks, text, hand-written SVG). Library matching runs
// locally against our bundled index; the model only supplies keywords.

import { chat } from './providers';
import { ModelJsonError, parseModelJson } from './json';
import { getAiSettings } from './settings';
import { loadLibraryIndex, searchLibrary, type LibraryEntry } from '../../assets/illustrations';
import { normalizeSvg } from '../svgImport';

export type Proposal =
  | { kind: 'text'; id: string; text: string; size: 'title' | 'normal' | 'small' }
  | { kind: 'library'; id: string; label: string; options: LibraryEntry[] }
  | { kind: 'svg'; id: string; label: string; svg: string };

const SYSTEM = `You are the assistant inside DrawFlow, a whiteboard-animation editor where a hand draws each element on screen.
The user describes what they want on the canvas. Reply with ONLY a JSON object, no prose, no markdown fences:
{"items":[
  {"type":"text","text":"...","size":"title|normal|small"},
  {"type":"library","label":"...","keywords":["...","..."]},
  {"type":"svg","label":"...","svg":"<svg viewBox=\\"0 0 200 200\\" ...>...</svg>"}
]}
Rules:
- Prefer "library" items. DrawFlow ships ~1400 simple black line-art illustrations: everyday objects, technology, business, food, animals, nature, travel, symbols and arrows, faces, and sketchy people doing things (reading, sitting, running, dancing, meditating, coffee, selfie, plant…). Give 2-4 short lowercase keywords (single words or two-word phrases) likely to match names/tags.
- Use "svg" only for things a stock library is unlikely to have, or when the user explicitly wants something drawn to their description. SVG rules: viewBox="0 0 200 200"; black outlines only: stroke="#111" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"; simple recognizable shapes built from path, circle, rect, line, ellipse, polyline; at most 40 elements; no text, no gradients, no images, no CSS, no transforms.
- "text" is for words the user wants written on the board (titles, labels, captions). Keep it short.
- A single object → one item. A scene or list → 2-6 items, in the order they should be drawn.`;

const SVG_ONLY_SYSTEM = `You draw simple black line-art illustrations as SVG for a whiteboard animation. Reply with ONLY the SVG markup, nothing else.
Rules: viewBox="0 0 200 200"; stroke="#111" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" on every shape; simple recognizable shapes from path, circle, rect, line, ellipse, polyline; at most 40 elements; no text, gradients, images, CSS or transforms.`;


export function extractSvg(text: string): string | null {
  const m = text.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0] : null;
}

function validSvg(svg: string): boolean {
  try { normalizeSvg(svg); return true; } catch { return false; }
}

/** Ask the model to draw one thing as SVG. */
export async function drawSvg(label: string): Promise<string> {
  const s = getAiSettings();
  const text = await chat(s.textProvider, s.keys[s.textProvider], s.textModel[s.textProvider], {
    system: SVG_ONLY_SYSTEM,
    user: `Draw: ${label}`,
  });
  const svg = extractSvg(text);
  if (!svg || !validSvg(svg)) throw new Error('The model did not return a usable drawing — try again or rephrase.');
  return svg;
}

/** Plan a request into proposals the user can add. */
export async function plan(request: string): Promise<Proposal[]> {
  const s = getAiSettings();
  const ask = (user: string) => chat(s.textProvider, s.keys[s.textProvider], s.textModel[s.textProvider], { system: SYSTEM, user, json: true });
  const raw = await ask(request);
  let parsed: { items?: unknown[] };
  try {
    parsed = parseModelJson(raw) as { items?: unknown[] };
  } catch (e) {
    if (!(e instanceof ModelJsonError)) throw e;
    const fixed = await ask(`The JSON below is broken (${e.message}). Return the same items as ONE valid JSON object — escape quotes inside strings, no trailing commas, no prose:\n\n${raw.slice(0, 12000)}`);
    parsed = parseModelJson(fixed) as { items?: unknown[] };
  }
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const index = await loadLibraryIndex().catch(() => [] as LibraryEntry[]);
  const out: Proposal[] = [];
  let n = 0;

  for (const it of items as Record<string, unknown>[]) {
    const id = `p${n++}`;
    if (it.type === 'text' && typeof it.text === 'string' && it.text.trim()) {
      const size = it.size === 'title' || it.size === 'small' ? it.size : 'normal';
      out.push({ kind: 'text', id, text: it.text.trim(), size });
    } else if (it.type === 'library') {
      const keywords = Array.isArray(it.keywords) ? (it.keywords as unknown[]).filter((k): k is string => typeof k === 'string') : [];
      const label = typeof it.label === 'string' && it.label ? it.label : keywords.join(' ');
      let options: LibraryEntry[] = [];
      if (keywords.length) {
        options = searchLibrary(index, keywords.join(' '), null);
        for (const k of keywords) {
          if (options.length >= 4) break;
          for (const e of searchLibrary(index, k, null)) if (!options.includes(e)) options.push(e);
        }
      }
      options = options.slice(0, 6);
      if (options.length) out.push({ kind: 'library', id, label, options });
      else if (label) {
        // nothing in the library — have the model draw it
        try { out.push({ kind: 'svg', id, label, svg: await drawSvg(label) }); } catch { /* skip */ }
      }
    } else if (it.type === 'svg' && typeof it.svg === 'string') {
      const svg = extractSvg(it.svg) ?? it.svg;
      const label = typeof it.label === 'string' ? it.label : 'Drawing';
      if (validSvg(svg)) out.push({ kind: 'svg', id, label, svg });
    }
  }
  if (out.length === 0) throw new Error('Nothing usable came back — try rephrasing.');
  return out;
}
