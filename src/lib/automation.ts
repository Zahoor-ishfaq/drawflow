// Scene-level building blocks for automation (the MCP server, scripts): add a
// scene of content, put a voiceover on it, describe a project. Everything is
// composed from what the editor itself uses — the add-element helpers and
// their layout, the store's scene and audio actions, the narration fitting
// of Script → scribe, and the app's own speech synthesis — so a project
// built this way is the same as one built by hand.

import { sequenceOrder, useStore } from '../store/useStore';
import { addImageFile, addImportedSvg, addLibraryIllustration, addTextSized } from './addElements';
import { elementBounds } from './camera';
import { motionWindow, slotEnd } from './timing';
import { cleanMotion } from './motionPath';
import { decodeToSource } from '../store/audioSources';
import { clipCaptions, speechSegments } from './audioTools';
import { cuesInRange, decodeSrt, parseSrt, subtitleCues, subtitleSettings, toSrt } from './subtitles';
import { fitToPhrases } from './narration';
import { loadLibraryIndex } from '../assets/illustrations';
import { buildIndex, searchAll } from './librarySearch';
import { KOKORO_VOICES, synthesizeSpeech } from './ai/speech';
import type { AudioClip, DrawElement, MotionEasing, Scene, SubtitleSettings } from '../types';

export type SceneItem =
  | { type: 'text'; text: string; size?: 'title' | 'normal' | 'small' }
  | { type: 'svg'; svg: string; label?: string }
  | { type: 'image'; base64: string; mime: string; name?: string }
  /** a picture from the built-in library of 5,000+, found by search */
  | { type: 'library'; query: string; color?: boolean };

export interface AddSceneOptions {
  name?: string;
  items: SceneItem[];
  /** seconds each item takes to draw (default: the item's own pace) */
  drawDuration?: number;
  /** seconds the finished scene stays on screen */
  holdDuration?: number;
  transition?: Scene['transition'];
}

export interface VoiceoverOptions {
  /** scene id, name or 1-based number */
  scene: string;
  /** an audio file… */
  audio?: { base64: string; mime: string; name?: string };
  /** …or text, spoken with the built-in voice */
  text?: string;
  voice?: string;
  /** retime the scene's drawing to the narration's phrases (default true) */
  fit?: boolean;
}

function findScene(ref: string): Scene {
  const scenes = useStore.getState().project.scenes ?? [];
  const n = /^\d+$/.test(ref.trim()) ? parseInt(ref, 10) : NaN;
  const sc = scenes.find((s) => s.id === ref) ?? scenes.find((s) => s.name.toLowerCase() === ref.trim().toLowerCase()) ?? (n >= 1 ? scenes[n - 1] : undefined);
  if (!sc) throw new Error(`No scene "${ref}". Scenes: ${scenes.map((s, i) => `${i + 1}. ${s.name}`).join(', ') || 'none yet'}.`);
  return sc;
}

function members(sceneId: string): DrawElement[] {
  return sequenceOrder(useStore.getState().elements).filter((e) => e.sceneId === sceneId && !e.hidden);
}

/** When a scene starts (its first transition) and ends (its last slot), in seconds. */
export function sceneRange(sceneId: string): { start: number; end: number } | null {
  const m = members(sceneId);
  if (!m.length) return null;
  return { start: Math.max(0, m[0].startTime - m[0].transitionIn), end: Math.max(...m.map(slotEnd)) };
}

async function addItem(item: SceneItem): Promise<void> {
  switch (item.type) {
    case 'text':
      if (!item.text?.trim()) throw new Error('A text item needs some text.');
      await addTextSized(item.text, item.size ?? 'normal');
      return;
    case 'svg':
      if (!/<svg[\s>]/i.test(item.svg ?? '')) throw new Error('An svg item needs SVG markup (<svg …>…</svg>).');
      addImportedSvg(item.svg, item.label ?? 'Drawing');
      return;
    case 'image': {
      const bytes = Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0));
      await addImageFile(new File([bytes], item.name ?? 'picture', { type: item.mime }));
      return;
    }
    case 'library': {
      // the same ranked search as the Library panel (synonyms, plurals, typos), pictures only
      const index = buildIndex({ illustrations: await loadLibraryIndex(), icons: [], uploads: [] });
      const hit = searchAll(index, item.query, 8).find((h) => h.kind === 'illustration');
      if (!hit || hit.kind !== 'illustration') throw new Error(`No library picture matches "${item.query}".`);
      await addLibraryIllustration(hit.entry, { color: item.color });
      return;
    }
    default:
      throw new Error(`Unknown item type "${(item as { type: string }).type}" — use text, svg, image or library.`);
  }
}

/**
 * Add a scene of content. Like Script → scribe, each scene gets its own
 * stretch of paper to the right of what is already there (so the camera
 * travels to it) and clears the board when it starts; inside it the items
 * are laid out by the editor's own placement, left to right.
 */
export async function addScene(opts: AddSceneOptions): Promise<{ id: string; name: string; elements: number; start: number; end: number }> {
  if (!opts.items?.length) throw new Error('A scene needs at least one item.');
  const s = useStore.getState();
  const { width: W, height: H } = s.project;
  const first = !(s.project.scenes ?? []).length;
  const right = s.elements.length ? Math.max(...s.elements.map((e) => { const b = elementBounds(e); return b.x + b.width; })) : -W * 0.2;
  const region = { x: Math.max(0, right + W * 0.2), y: 0, width: W, height: H };
  const before = new Set(s.elements.map((e) => e.id));

  const scene = s.addScene(opts.name);
  if (!first) s.updateScene(scene.id, { transition: opts.transition ?? 'fade', clearBefore: true });
  else if (opts.transition) s.updateScene(scene.id, { transition: opts.transition });
  s.select(null); // new elements join the last scene
  s.setCameraBoundary(region); // …and are placed inside its stretch of paper
  try {
    for (const item of opts.items) await addItem(item);
  } finally {
    useStore.getState().setCameraBoundary(null);
  }

  const st = useStore.getState();
  const added = sequenceOrder(st.elements).filter((e) => !before.has(e.id));
  added.forEach((e, i) => {
    const patch: Partial<DrawElement> = {};
    if (opts.drawDuration !== undefined) patch.drawDuration = Math.max(0.2, opts.drawDuration);
    if (i === added.length - 1 && opts.holdDuration !== undefined) patch.pauseAfter = Math.max(0, opts.holdDuration);
    if (Object.keys(patch).length) st.updateElement(e.id, patch);
  });
  st.select(null);
  const range = sceneRange(scene.id) ?? { start: 0, end: 0 };
  return { id: scene.id, name: scene.name, elements: added.length, ...range };
}

/**
 * Put narration on a scene's voice lane, replacing any it had. With `fit`,
 * the scene's drawing is retimed to the narration's phrases (the fitting
 * Script → scribe uses); later scenes move and their voiceovers move with them.
 */
export async function addVoiceover(opts: VoiceoverOptions): Promise<{ scene: string; duration: number; start: number; end: number }> {
  const scene = findScene(opts.scene);
  const m = members(scene.id);
  if (!m.length) throw new Error(`Scene "${scene.name}" has no elements to narrate.`);

  let blob: Blob;
  let name: string;
  if (opts.audio) {
    const bytes = Uint8Array.from(atob(opts.audio.base64), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: opts.audio.mime });
    name = opts.audio.name ?? `Voiceover — ${scene.name}`;
  } else if (opts.text?.trim()) {
    const voice = opts.voice ?? KOKORO_VOICES[0].id;
    if (!KOKORO_VOICES.some((v) => v.id === voice)) throw new Error(`Unknown voice "${voice}". Voices: ${KOKORO_VOICES.map((v) => v.id).join(', ')}.`);
    blob = await synthesizeSpeech('kokoro', '', opts.text.trim(), voice);
    name = `Narration — ${scene.name}`;
  } else {
    throw new Error('Give either an audio file or text for the voiceover.');
  }
  const src = await decodeToSource(blob, name);

  // scene starts before any retiming, so other scenes' voiceovers can follow their scenes
  const s = useStore.getState();
  const scenes = s.project.scenes ?? [];
  const startsBefore = new Map(scenes.map((sc) => [sc.id, sceneRange(sc.id)?.start]));
  for (const c of s.audioClips.filter((x) => x.sceneId === scene.id && x.lane === 'voice')) s.removeAudioClip(c.id);

  if (opts.fit !== false) {
    // one phrase per element, cut at the narrator's real pauses; the scene's own transition stays
    const segs = speechSegments(src.buffer, 0, src.duration, 0.3);
    const patches = fitToPhrases(m, segs.length ? segs : [{ start: 0, end: src.duration }]);
    for (const [id, p] of patches) {
      if (id === m[0].id) delete p.transitionIn;
      useStore.getState().updateElement(id, p);
    }
  } else {
    // at least keep the scene on screen until the narration has finished
    const range = sceneRange(scene.id)!;
    const at = m[0].startTime;
    const short = at + src.duration + 0.4 - range.end;
    const after = members(scene.id);
    const last = after[after.length - 1];
    if (short > 0) useStore.getState().updateElement(last.id, { pauseAfter: last.pauseAfter + short });
  }

  // later scenes may have moved: their scene-bound clips move with them (as moveScene does)
  const cur = useStore.getState();
  const shifted: AudioClip[] = cur.audioClips.map((c) => {
    if (!c.sceneId) return c;
    const was = startsBefore.get(c.sceneId);
    const now = sceneRange(c.sceneId)?.start;
    return was === undefined || now === undefined || now === was ? c : { ...c, startTime: Math.max(0, c.startTime + now - was) };
  });
  if (shifted.some((c, i) => c !== cur.audioClips[i])) cur.loadDocument({ project: cur.project, elements: cur.elements, audioClips: shifted });

  const at = members(scene.id)[0].startTime;
  useStore.getState().addAudioClip({
    id: crypto.randomUUID(), name: src.name, lane: 'voice', sourceId: src.id, startTime: at, offset: 0, duration: src.duration,
    volume: 1, fadeIn: 0, fadeOut: 0, muted: false, sceneId: scene.id, ...clipCaptions(src.buffer, opts.text),
  }, { overwrite: true });
  useStore.getState().select(null);
  const range = sceneRange(scene.id)!;
  return { scene: scene.name, duration: +src.duration.toFixed(2), ...range };
}

/** Turn subtitles on or off, or change how they look. */
export function setSubtitles(change: Partial<Omit<SubtitleSettings, 'cues'>>): SubtitleSettings {
  const s = useStore.getState();
  const given = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
  const next = { ...subtitleSettings(s.project), ...given };
  if (!['top', 'middle', 'bottom'].includes(next.position)) throw new Error('Subtitle position must be top, middle or bottom.');
  if (!(next.size >= 12 && next.size <= 160)) throw new Error('Subtitle size must be between 12 and 160.');
  s.updateProject({ subtitles: next });
  return next;
}

/** Use a subtitle file (.srt or .vtt) for the whole video, and show it. Returns how many lines it has. */
export function importSubtitles(file: string | ArrayBuffer | Uint8Array): number {
  const cues = parseSrt(typeof file === 'string' ? file : decodeSrt(file));
  if (!cues.length) throw new Error('No subtitles found. Is this an .srt file?');
  const s = useStore.getState();
  s.updateProject({ subtitles: { ...subtitleSettings(s.project), show: true, cues } });
  return cues.length;
}

/** The project's subtitles as .srt text, optionally just those of a time range (timed from its start). */
export function subtitlesSrt(range?: { start: number; end: number }): string {
  const { project, audioClips } = useStore.getState();
  const cues = subtitleCues(project, audioClips);
  return toSrt(range ? cuesInRange(cues, range.start, range.end) : cues);
}

export interface MotionPathOptions {
  /** element id or label… */
  element?: string;
  /** …or a scene (id, name or 1-based number) and the item in it (1-based, in drawing order) */
  scene?: string;
  item?: number;
  /**
   * The route, as offsets in canvas px from the element's centre: [x, y] pairs or {x, y}.
   * A starting [0, 0] is added when the first point is not the centre.
   */
  points: unknown[];
  /** seconds to travel the route (default 3) */
  duration?: number;
  /** seconds after the element has appeared before it sets off (default 0) */
  delay?: number;
  easing?: MotionEasing;
  /** turn to face the direction of travel */
  orient?: boolean;
  /** with orient: which way the picture faces, so that side leads — 'right' (default), 'left', 'up' or 'down' */
  facing?: 'right' | 'left' | 'up' | 'down';
  /** straight lines between the points instead of a curve */
  straight?: boolean;
}

/**
 * Make an element travel along a route after it appears (a bird flying across
 * the board while its GIF flaps). Pass `points: []` to remove its motion path.
 */
export function setMotionPath(opts: MotionPathOptions): { element: string; label: string; start: number; end: number; projectDuration: number } | { element: string; label: string; removed: true } {
  const st = useStore.getState();
  let el: DrawElement | undefined;
  if (opts.element) {
    el = st.elements.find((e) => e.id === opts.element) ?? st.elements.find((e) => e.label.toLowerCase() === opts.element!.trim().toLowerCase());
    if (!el) throw new Error(`No element "${opts.element}".`);
  } else if (opts.scene !== undefined) {
    const sc = findScene(String(opts.scene));
    const list = members(sc.id);
    const n = opts.item ?? 1;
    el = list[n - 1];
    if (!el) throw new Error(`Scene "${sc.name}" has ${list.length} item(s); there is no item ${n}.`);
  } else throw new Error('Say which element: "element" (id or label), or "scene" and "item".');

  if (!opts.points?.length) {
    st.updateElement(el.id, { motion: null });
    return { element: el.id, label: el.label, removed: true };
  }
  const raw = opts.points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)) as { x: unknown; y: unknown }[];
  const first = raw[0];
  const points = first && first.x === 0 && first.y === 0 ? raw : [{ x: 0, y: 0 }, ...raw];
  const motion = cleanMotion({
    points, duration: opts.duration ?? 3, delay: opts.delay ?? 0, easing: opts.easing ?? 'easeInOut',
    orient: !!opts.orient, smooth: !opts.straight,
    facing: opts.facing === 'up' ? 'top' : opts.facing === 'down' ? 'bottom' : opts.facing,
  });
  if (!motion) throw new Error('A motion path needs at least one point to travel to, as [x, y] numbers.');
  st.updateElement(el.id, { motion });
  const fresh = useStore.getState().elements.find((e) => e.id === el!.id)!;
  const w = motionWindow(fresh)!;
  return { element: el.id, label: el.label, start: +w.start.toFixed(2), end: +w.end.toFixed(2), projectDuration: +useStore.getState().project.duration.toFixed(2) };
}

/** A plain summary of the open project: settings, scenes with their timing, items and voiceovers. */
export function describeProject() {
  const { project: p, elements, audioClips } = useStore.getState();
  const order = sequenceOrder(elements);
  return {
    name: p.name, width: p.width, height: p.height, fps: p.fps, exportHeight: p.exportHeight ?? 1080,
    duration: +p.duration.toFixed(2),
    scenes: (p.scenes ?? []).map((sc, i) => {
      const range = sceneRange(sc.id);
      return {
        number: i + 1, id: sc.id, name: sc.name, transition: sc.transition,
        start: range ? +range.start.toFixed(2) : null, end: range ? +range.end.toFixed(2) : null,
        items: order.filter((e) => e.sceneId === sc.id).map((e) => {
          const w = motionWindow(e);
          return {
            kind: e.kind, label: e.label, start: +e.startTime.toFixed(2), drawDuration: e.drawDuration, holdAfter: e.pauseAfter,
            ...(w && e.motion ? { motionPath: { points: e.motion.points.length, setsOff: +w.start.toFixed(2), arrives: +w.end.toFixed(2) } } : {}),
          };
        }),
        voiceovers: audioClips.filter((c) => c.sceneId === sc.id).map((c) => ({ name: c.name, lane: c.lane, start: +c.startTime.toFixed(2), duration: +c.duration.toFixed(2) })),
      };
    }),
    subtitles: (({ cues: _, ...look }) => ({ ...look, lines: subtitleCues(p, audioClips).length }))(subtitleSettings(p)),
    otherAudio: audioClips.filter((c) => !c.sceneId).map((c) => ({ name: c.name, lane: c.lane, start: +c.startTime.toFixed(2), duration: +c.duration.toFixed(2) })),
  };
}
