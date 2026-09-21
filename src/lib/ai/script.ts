// Script → scribe: the model turns a script or a topic into scenes, each with
// narration and a handful of items (text, library pictures, drawn SVG). We
// lay the items out per scene, build the scenes with transitions, optionally
// speak the narration with a TTS provider onto the voice lane, and retime
// the elements to the narration.

import { chat } from './providers';
import { getAiSettings } from './settings';
import { synthesizeSpeech, type SpeechProvider } from './speech';
import { drawSvg, extractSvg } from './planner';
import { ModelJsonError, parseModelJson } from './json';
import { loadLibraryIndex, loadLibrarySvg, type LibraryEntry } from '../../assets/illustrations';
import { buildIndex, searchAll } from '../librarySearch';
import { normalizeSvg } from '../svgImport';
import { textToPaths } from '../textToPaths';
import { measurePaths } from '../drawing';
import { useStore } from '../../store/useStore';
import { audioContext, decodeToSource } from '../../store/audioSources';
import { fitToPhrases, matchPhrases } from '../narration';
import { speechSegments } from '../audioTools';
import { paperDef } from '../../assets/paper';
import type { DrawElement, Scene } from '../../types';

export interface ScriptScene {
  name: string;
  narration: string;
  items: ({ type: 'text'; text: string; size?: 'title' | 'normal' | 'small' } | { type: 'library'; label: string; keywords: string[] } | { type: 'svg'; label: string; svg: string })[];
}
export interface ScriptPlan { title: string; scenes: ScriptScene[] }

const SYSTEM = `You are the assistant inside DrawFlow, a whiteboard-animation editor: a hand draws pictures and words on a board while a narrator speaks, one scene after another.
Turn the user's script or topic into a plan for a short whiteboard video. Reply with ONLY a JSON object, no prose, no markdown fences:
{"title":"...","scenes":[{"name":"...","narration":"what the narrator says during this scene","items":[
  {"type":"text","text":"1-4 words","size":"title|normal|small"},
  {"type":"library","label":"what the picture shows","keywords":["noun","noun"]},
  {"type":"svg","label":"...","svg":"<svg viewBox='0 0 200 200'>...</svg>"}
]}]}
How to make it good:
- One story, told in order: each scene is the next step and follows from the previous one (setup → problem → how it works → result). 3 to 6 scenes.
- The narration of a scene (12-35 words, spoken language, addressed to "you") must mention every item of that scene, in the same order as the items. The pictures are literally what the narration talks about — no decoration.
- 2 to 4 items per scene. At most one "text" item per scene: a key phrase, number or label that is actually said in the narration ("3 steps", "save 20%", "the seed") — never a sentence.
- "library" items are looked up in a library of about 5,000 pictures: everyday objects, tools, devices, buildings, vehicles, food, animals, plants, weather, people (standing, sitting, pointing, walking, working at a laptop, thinking), faces and emotions, business (chart, growth, money, coins, wallet, briefcase, handshake, calendar, clock, target), science and school (book, atom, flask, microscope, graduation cap, light bulb, brain), health (doctor, heart, pill, hospital), symbols (arrow, check, question mark, star, shield, key, lock). "keywords" are 2-4 concrete singular nouns naming what should be seen ("light bulb", "idea"), most specific first.
- Use "svg" only when no common picture fits (a diagram, a specific arrangement): viewBox='0 0 200 200', stroke='#111' fill='none' stroke-width='5', simple shapes only (path, circle, rect, line, ellipse, polyline), at most 40 elements, no text. Use single quotes for every SVG attribute so the JSON string stays valid.
- The whole reply must be one valid JSON object: double-quoted keys and strings, quotes inside strings escaped as \\", no trailing commas, no comments.
- If the user gave a full script, keep their wording as the narration and split it into scenes at natural pauses.`;

/** Ask the model for the plan; a broken reply is repaired locally, then once more by the model itself. */
export async function planScript(request: string): Promise<ScriptPlan> {
  const s = getAiSettings();
  const ask = (user: string) => chat(s.textProvider, s.keys[s.textProvider], s.textModel[s.textProvider], { system: SYSTEM, user, json: true });
  const raw = await ask(request);
  // a reply counts as usable only when it parses AND has scenes with items
  const read = (text: string): ScriptPlan => {
    const parsed = parseModelJson(text) as Partial<ScriptPlan>;
    const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).filter((sc) => sc && Array.isArray((sc as ScriptScene).items)) as ScriptScene[];
    if (scenes.length === 0) throw new ModelJsonError('no scenes with items in the reply');
    return { title: typeof parsed.title === 'string' && parsed.title ? parsed.title : 'AI scribe', scenes: scenes.slice(0, 8) };
  };
  try {
    return read(raw);
  } catch (e) {
    if (!(e instanceof ModelJsonError)) throw e;
    // second chance: the model fixes its own output (cheaper than a fresh plan and keeps the content)
    const fixed = await ask(`The JSON below is broken (${e.message}). Return the same plan as ONE valid JSON object with "title" and "scenes" — escape quotes inside strings, no trailing commas, no prose:\n\n${raw.slice(0, 12000)}`);
    return read(fixed);
  }
}

/** One scene's narration, spoken and decoded, ready to preview or import. */
export interface NarrationTake {
  scene: number;
  name: string;
  blob: Blob;
  buffer: AudioBuffer;
  duration: number;
  /** object URL for previewing; revoke with `releaseTakes` */
  url: string;
}

export interface NarrateOptions {
  provider: SpeechProvider;
  voice: string;
  onProgress?: (msg: string, index: number, total: number) => void;
}

/**
 * Speak every scene's narration. Scenes without narration are skipped; a
 * scene whose synthesis fails is reported through `failed` rather than
 * aborting the rest, unless nothing at all could be spoken.
 */
export async function narratePlan(plan: ScriptPlan, opts: NarrateOptions): Promise<{ takes: NarrationTake[]; failed: { scene: number; error: unknown }[] }> {
  const keys = getAiSettings().keys;
  const todo = plan.scenes.map((sc, i) => ({ i, text: sc.narration?.trim() ?? '' })).filter((x) => x.text);
  const takes: NarrationTake[] = [];
  const failed: { scene: number; error: unknown }[] = [];
  for (let k = 0; k < todo.length; k++) {
    const { i, text } = todo[k];
    opts.onProgress?.(`Scene ${i + 1} of ${plan.scenes.length}: “${text.slice(0, 48)}${text.length > 48 ? '…' : ''}”`, k, todo.length);
    try {
      const blob = await synthesizeSpeech(opts.provider, keys[opts.provider], text, opts.voice);
      const buffer = await audioContext().decodeAudioData(await blob.arrayBuffer());
      takes.push({ scene: i, name: `Narration — ${plan.scenes[i].name || `Scene ${i + 1}`}`, blob, buffer, duration: buffer.duration, url: URL.createObjectURL(blob) });
    } catch (error) {
      failed.push({ scene: i, error });
      if (takes.length === 0 && k === todo.length - 1) throw error;
    }
  }
  if (todo.length && takes.length === 0 && failed.length) throw failed[0].error;
  return { takes, failed };
}

export function releaseTakes(takes: NarrationTake[]): void {
  for (const t of takes) { try { URL.revokeObjectURL(t.url); } catch { /* already gone */ } }
}

export interface BuildOptions {
  /** narration already spoken with `narratePlan` — goes on the voice lane and times the drawing */
  narration?: NarrationTake[];
  /** or speak it now with this provider (needs a key) */
  narrate?: { provider: SpeechProvider; voice: string };
  onProgress?: (msg: string) => void;
}

/** Turn a plan into the open project: scenes, elements, optional narration and timing. */
export async function buildScript(plan: ScriptPlan, opts: BuildOptions = {}): Promise<void> {
  const st = useStore.getState();
  const { width: W, height: H } = st.project;
  const ink = paperDef(st.project.paper).ink;
  const index = await loadLibraryIndex().catch(() => [] as LibraryEntry[]);
  // the same ranked search as the Library panel (synonyms, plurals, typos), pictures only
  const searchIndex = buildIndex({ illustrations: index, icons: [], uploads: [] });
  // a hit is "confident" when a query word is in the picture's name (10+),
  // not merely one of its tags; weak hits are kept as a last resort
  const lookup = (q: string): { entry: LibraryEntry; score: number } | null => {
    const hit = searchAll(searchIndex, q, 8).find((h) => h.kind === 'illustration');
    return hit && hit.kind === 'illustration' ? { entry: hit.entry, score: hit.score } : null;
  };
  const findPicture = (queries: string[]): { entry: LibraryEntry; confident: boolean } | null => {
    let best: { entry: LibraryEntry; score: number } | null = null;
    for (const q of queries) {
      if (!q) continue;
      const h = lookup(q);
      if (h && (!best || h.score > best.score)) best = h;
      if (best && best.score >= 10) break;
    }
    return best ? { entry: best.entry, confident: best.score >= 10 } : null;
  };
  let drawBudget = 4; // AI-drawn stand-ins are slow and cost a call each
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
            const kws = (it.keywords ?? []).map((k) => String(k).trim()).filter(Boolean);
            const hit = findPicture([kws.join(' '), ...kws, it.label ?? '']);
            if (hit?.confident) { svg = await loadLibrarySvg(hit.entry.src); label = hit.entry.name; }
            else {
              // nothing in the library is clearly it: let the model draw it, then fall back to the best weak match
              if (drawBudget > 0) { drawBudget--; try { svg = await drawSvg(it.label || kws.join(' ')); } catch { svg = null; } }
              if (!svg && hit) { svg = await loadLibrarySvg(hit.entry.src); label = hit.entry.name; }
            }
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
  let takes = opts.narration ?? [];
  if (!takes.length && opts.narrate) {
    takes = (await narratePlan(plan, { ...opts.narrate, onProgress: (m) => opts.onProgress?.(`Narrating ${m}`) })).takes;
  }
  if (takes.length) {
    const phrases: { start: number; end: number }[] = [];
    let at = 0;
    for (const take of takes) {
      const si = take.scene;
      if (!scenes[si]) continue;
      opts.onProgress?.(`Placing narration for scene ${si + 1} of ${plan.scenes.length}`);
      const src = await decodeToSource(take.blob, take.name);
      useStore.getState().addAudioClip({ id: crypto.randomUUID(), name: src.name, lane: 'voice', sourceId: src.id, startTime: at, offset: 0, duration: src.duration, volume: 1, fadeIn: 0, fadeOut: 0, muted: false, sceneId: scenes[si].id });
      // one phrase per item in the scene, cut at the narrator's real pauses
      const segs = speechSegments(src.buffer, 0, src.duration, 0.3);
      const wanted = elements.filter((e) => e.sceneId === scenes[si].id && !e.hidden && !e.withPrevious).length;
      const local = segs.length ? segs : [{ start: 0, end: src.duration }];
      for (const ph of matchPhrases(local, wanted)) phrases.push({ start: at + ph.start, end: at + ph.end });
      at += src.duration + 0.6;
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
