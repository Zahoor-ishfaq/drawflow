// Script → scribe: the model turns a script or a topic into scenes, each with
// narration and a handful of items (text, library pictures, drawn SVG). We
// lay the items out per scene, build the scenes with transitions, optionally
// speak the narration with a TTS provider onto the voice lane, and retime
// the elements to the narration.

import { chat } from './providers';
import { getAiSettings } from './settings';
import { synthesizeSpeech, type SpeechProvider } from './speech';
import { drawSvg, extractSvg } from './planner';
import { loadLibraryIndex, loadLibrarySvg, searchLibrary, type LibraryEntry } from '../../assets/illustrations';
import { normalizeSvg } from '../svgImport';
import { textToPaths } from '../textToPaths';
import { measurePaths } from '../drawing';
import { useStore } from '../../store/useStore';
import { decodeToSource } from '../../store/audioSources';
import { fitToPhrases } from '../narration';
import { speechSegments } from '../audioTools';
import { paperDef } from '../../assets/paper';
import type { DrawElement, Scene } from '../../types';

export interface ScriptScene {
  name: string;
  narration: string;
  items: ({ type: 'text'; text: string; size?: 'title' | 'normal' | 'small' } | { type: 'library'; label: string; keywords: string[] } | { type: 'svg'; label: string; svg: string })[];
}
export interface ScriptPlan { title: string; scenes: ScriptScene[] }

const SYSTEM = `You are the assistant inside DrawFlow, a whiteboard-animation editor where a hand draws each element while a narrator speaks.
Turn the user's script or topic into a short whiteboard video plan. Reply with ONLY a JSON object, no prose, no markdown fences:
{"title":"...","scenes":[{"name":"...","narration":"one or two spoken sentences","items":[
  {"type":"text","text":"a few words on the board","size":"title|normal|small"},
  {"type":"library","label":"...","keywords":["...","..."]},
  {"type":"svg","label":"...","svg":"<svg viewBox=\\"0 0 200 200\\">...</svg>"}
]}]}
Rules:
- 3 to 6 scenes. Each scene: 2 to 4 items, in the order they are drawn, and narration of 8-30 words that the items illustrate.
- Prefer "library" items (about 1400 simple black line-art pictures: objects, technology, business, food, animals, nature, travel, symbols, arrows, faces, and sketchy people reading, sitting, running, dancing, meditating, drinking coffee…). Give 2-4 short lowercase keywords.
- Use "svg" only for something the library surely lacks: viewBox="0 0 200 200", stroke="#111" fill="none" stroke-width="5", simple shapes (path, circle, rect, line, ellipse, polyline), at most 40 elements, no text.
- "text" items are the few words written on the board — never the whole narration.
- If the user gave a full script, keep their wording for the narration and split it into scenes.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The model did not return a plan.');
  return JSON.parse(body.slice(start, end + 1));
}

/** Ask the model for the plan. */
export async function planScript(request: string): Promise<ScriptPlan> {
  const s = getAiSettings();
  const raw = await chat(s.textProvider, s.keys[s.textProvider], s.textModel[s.textProvider], { system: SYSTEM, user: request });
  const parsed = extractJson(raw) as Partial<ScriptPlan>;
  const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).filter((sc) => sc && Array.isArray((sc as ScriptScene).items)) as ScriptScene[];
  if (scenes.length === 0) throw new Error('The model returned no scenes — try rephrasing.');
  return { title: typeof parsed.title === 'string' && parsed.title ? parsed.title : 'AI scribe', scenes: scenes.slice(0, 8) };
}

export interface BuildOptions {
  /** speak each scene's narration with this provider (needs a key) */
  narrate?: { provider: SpeechProvider; voice: string };
  onProgress?: (msg: string) => void;
}

/** Turn a plan into the open project: scenes, elements, optional narration and timing. */
export async function buildScript(plan: ScriptPlan, opts: BuildOptions = {}): Promise<void> {
  const st = useStore.getState();
  const { width: W, height: H } = st.project;
  const ink = paperDef(st.project.paper).ink;
  const index = await loadLibraryIndex().catch(() => [] as LibraryEntry[]);
  const elements: DrawElement[] = [];
  const scenes: Scene[] = [];
  let z = st.elements.reduce((m, e) => Math.max(m, e.zIndex), -1) + 1;

  // scenes sit side by side on the paper (to the right of anything already there)
  const existing = st.elements.length ? Math.max(...st.elements.map((e) => e.x)) + W * 1.2 : 0;
  for (let si = 0; si < plan.scenes.length; si++) {
    const sc = plan.scenes[si];
    const ox = existing + si * W * 1.2;
    opts.onProgress?.(`Building scene ${si + 1} of ${plan.scenes.length}: ${sc.name}`);
    const scene: Scene = {
      id: crypto.randomUUID(), name: sc.name || `Scene ${si + 1}`, transition: si === 0 ? 'cut' : 'fade', transitionDuration: 0.6, clearBefore: si > 0,
    };
    scenes.push(scene);
    // layout: a title row, then the rest side by side
    const items = sc.items.slice(0, 5);
    const bodies = items.filter((it) => !(it.type === 'text' && it.size === 'title'));
    const titles = items.filter((it) => it.type === 'text' && it.size === 'title');
    let bodyIndex = 0;
    const slotW = W / Math.max(1, bodies.length);
    for (const it of items) {
      const isTitle = it.type === 'text' && it.size === 'title';
      const cx = ox + (isTitle ? W / 2 : slotW * (bodyIndex + 0.5));
      const cy = isTitle ? H * 0.2 : titles.length ? H * 0.6 : H * 0.5;
      if (!isTitle) bodyIndex++;
      const base = {
        id: crypto.randomUUID(), rotation: 0, startTime: 0, transitionIn: 0.5, pauseAfter: 0.5, slideFrom: 'left' as const,
        zIndex: z++, camera: 'scene' as const, cameraZoom: 1, sceneId: scene.id, style: 'draw' as const, fillAfterDraw: false,
        fillColor: 'none', strokeColor: ink, strokeWidth: 4, scale: 1,
      };
      try {
        if (it.type === 'text') {
          const size = it.size === 'title' ? 150 : it.size === 'small' ? 80 : 110;
          const text = it.text.trim();
          if (!text) continue;
          const paths = await textToPaths(text, 'caveat', size, { align: 'center' });
          const b = measurePaths(paths).bbox;
          elements.push({
            ...base, kind: 'text', paths, label: text.slice(0, 24), text, fontFamily: 'caveat', fontSize: size, align: 'center',
            x: cx - (b.x + b.width / 2), y: cy - (b.y + b.height / 2), fillColor: ink, fillAfterDraw: true, strokeWidth: 2,
            drawDuration: Math.min(5, Math.max(1.2, text.length * 0.08)),
          });
        } else {
          let svg: string | null = null;
          let label = it.label || 'Drawing';
          if (it.type === 'library') {
            const q = (it.keywords ?? []).join(' ');
            let hits = q ? searchLibrary(index, q, null) : [];
            for (const k of it.keywords ?? []) { if (hits.length) break; hits = searchLibrary(index, k, null); }
            if (hits.length) { svg = await loadLibrarySvg(hits[0].src); label = hits[0].name; }
            else { try { svg = await drawSvg(it.label || q); } catch { svg = null; } }
          } else {
            svg = extractSvg(it.svg) ?? it.svg;
          }
          if (!svg) continue;
          const art = normalizeSvg(svg);
          const size = Math.min(slotW * 0.7, H * 0.38);
          const scale = size / Math.max(art.width, art.height, 1);
          const b = measurePaths(art.paths).bbox;
          elements.push({
            ...base, kind: 'svg', paths: art.paths, label, scale,
            x: cx - (b.x + b.width / 2) * scale, y: cy - (b.y + b.height / 2) * scale,
            fillRule: art.evenOdd ? 'evenodd' : undefined,
            ...(art.monochrome
              ? { strokeWidth: Math.min(10, Math.max(3, (Math.max(art.width, art.height) / 40) * scale)) }
              : { pathFills: art.fills, pathStrokes: art.strokes, fillColor: ink, fillAfterDraw: true, strokeWidth: Math.min(2.5, Math.max(0.8, (Math.max(art.width, art.height) / 400) * scale)) }),
            drawDuration: Math.min(4, Math.max(1.5, art.paths.length * 0.2)),
          });
        }
      } catch { /* skip an item that fails */ }
    }
  }

  // commit the document: keep existing elements/scenes, append ours
  const s = useStore.getState();
  s.loadDocument({
    project: { ...s.project, name: s.elements.length ? s.project.name : plan.title, scenes: [...(s.project.scenes ?? []), ...scenes] },
    elements: [...s.elements, ...elements],
    audioClips: s.audioClips,
  });

  // narration: clips laid end to end on the voice lane (a short gap between
  // scenes), then the elements are retimed so each is drawn during its phrase
  if (opts.narrate) {
    const keys = getAiSettings().keys;
    const phrases: { start: number; end: number }[] = [];
    let at = 0;
    for (let si = 0; si < plan.scenes.length; si++) {
      const text = plan.scenes[si].narration?.trim();
      if (!text) continue;
      opts.onProgress?.(`Narrating scene ${si + 1}: “${text.slice(0, 40)}…”`);
      try {
        const blob = await synthesizeSpeech(opts.narrate.provider, keys[opts.narrate.provider], text, opts.narrate.voice);
        const src = await decodeToSource(blob, `Narration — ${scenes[si].name}`);
        useStore.getState().addAudioClip({ id: crypto.randomUUID(), name: src.name, lane: 'voice', sourceId: src.id, startTime: at, offset: 0, duration: src.duration, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, sceneId: scenes[si].id });
        const segs = speechSegments(src.buffer, 0, src.duration, 0.3);
        // one phrase per item in the scene: split or merge the detected segments
        const wanted = elements.filter((e) => e.sceneId === scenes[si].id).length;
        const local = segs.length ? segs : [{ start: 0, end: src.duration }];
        const span = { start: local[0].start, end: local[local.length - 1].end };
        for (let k = 0; k < wanted; k++) {
          const a = span.start + ((span.end - span.start) * k) / wanted;
          const b = span.start + ((span.end - span.start) * (k + 1)) / wanted;
          phrases.push({ start: at + a, end: at + b });
        }
        at += src.duration + 0.6;
      } catch (e) {
        opts.onProgress?.(`Narration failed for scene ${si + 1}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (phrases.length) {
      const cur = useStore.getState();
      const ordered = [...cur.elements].sort((a, b) => a.zIndex - b.zIndex).filter((e) => elements.some((x) => x.id === e.id));
      const patches = fitToPhrases(ordered, phrases.sort((a, b) => a.start - b.start));
      for (const [id, p] of patches) cur.updateElement(id, p);
    }
  }
  opts.onProgress?.('Done');
}
