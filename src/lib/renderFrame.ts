// The canvas is a pure function of currentTime (spec §6). This module holds
// that function in data form: given the project and a time, what should be on
// screen — element reveal state, emphasis/exit motion, camera view, scene
// transitions and hand pose. Both the live React canvas and the deterministic
// export pipeline consume these, so preview and exported video always match.

import type { Direction, DrawElement, HandStyle, MotionEasing, Project, Scene } from '../types';
import { applyTransform, dashPropsAt, handTransformAt, measurePaths, pointAt, type DashProps, type PathMeasure } from './drawing';
import { buildCameraTimeline, cameraAt, localBounds, viewBoxFor, type CameraTimeline } from './camera';
import { handDef, handInnerSvg, type HandDef } from '../assets/hands';
import { paperDef } from '../assets/paper';
import { scribblePath, scribbleStrokeWidth } from './scribble';
import { drawEnd, emphasisWindow, exitWindow, slotEnd } from './timing';
import { pluginEffect } from './plugins';

export const FILL_FADE_SECONDS = 0.2;
const HAND_IN_SECONDS = 0.45;
const HAND_OUT_SECONDS = 0.35;

export interface Rect { x: number; y: number; width: number; height: number }

export interface ElementFrame {
  groupOpacity: number;
  fillOpacity: number;
  /** null → no dash manipulation (appear/fade/slide, or fully drawn) */
  dashes: DashProps[] | null;
  /** extra translation (slide-in), canvas units */
  dx: number;
  dy: number;
  /** extra scale / rotation about the element origin (entrance + emphasis) */
  scale: number;
  rotate: number;
  /** clip rectangle in local coords (wipe entrance / exit), or null */
  clip: Rect | null;
  /** highlight strength 0..1 (yellow marker wash behind the element) */
  highlight: number;
  /** raster reveal shape (wipe / radial) as mask markup in image px, or null */
  revealMask: string | null;
  /** number of sub-paths visible (typewriter), or null for all */
  visibleCount: number | null;
  /** erase exit: scribble strokes that hide the element, in local coords */
  erase: { d: string; strokeWidth: number; dash: DashProps } | null;
}

export const FULL_FRAME: ElementFrame = {
  groupOpacity: 1, fillOpacity: 1, dashes: null, dx: 0, dy: 0, scale: 1, rotate: 0,
  clip: null, highlight: 0, revealMask: null, visibleCount: null, erase: null,
};

export function elementProgress(el: DrawElement, t: number): number {
  if (t < el.startTime) return 0;
  if (el.drawDuration <= 0) return 1;
  return Math.min((t - el.startTime) / el.drawDuration, 1);
}

// --- easing ----------------------------------------------------------------

function easeOutCubic(p: number): number { return 1 - Math.pow(1 - p, 3); }
function easeInCubic(p: number): number { return p * p * p; }
function easeInOutCubic(p: number): number { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
function easeOutBack(p: number): number { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
function easeOutBounce(p: number): number {
  const n1 = 7.5625, d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
}

function ease(p: number, easing: MotionEasing | undefined): number {
  switch (easing) {
    case 'linear': return p;
    case 'easeIn': return easeInCubic(p);
    case 'easeInOut': return easeInOutCubic(p);
    default: return easeOutCubic(p);
  }
}

// --- stroke order ----------------------------------------------------------

const orderCache = new WeakMap<PathMeasure, Map<string, number[]>>();

/** Index permutation: the order the hand draws the element's sub-paths in. */
export function strokeOrder(el: DrawElement, m: PathMeasure): number[] {
  const mode = el.strokeOrder ?? 'file';
  const n = m.lengths.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (mode === 'file' || n < 2) return idx;
  let byM = orderCache.get(m);
  if (!byM) { byM = new Map(); orderCache.set(m, byM); }
  const hit = byM.get(mode);
  if (hit) return hit;
  const centres = m.boxes.map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
  const cx = m.bbox.x + m.bbox.width / 2, cy = m.bbox.y + m.bbox.height / 2;
  let out: number[];
  switch (mode) {
    case 'reverse': out = idx.reverse(); break;
    case 'leftToRight': out = idx.sort((a, b) => centres[a].x - centres[b].x); break;
    case 'rightToLeft': out = idx.sort((a, b) => centres[b].x - centres[a].x); break;
    case 'topToBottom': out = idx.sort((a, b) => centres[a].y - centres[b].y); break;
    case 'bottomToTop': out = idx.sort((a, b) => centres[b].y - centres[a].y); break;
    case 'centerOut':
      out = idx.sort((a, b) => Math.hypot(centres[a].x - cx, centres[a].y - cy) - Math.hypot(centres[b].x - cx, centres[b].y - cy));
      break;
    default: out = idx;
  }
  byM.set(mode, out);
  return out;
}

/** Dash props honouring the element's stroke order. */
function orderedDashes(el: DrawElement, m: PathMeasure, p: number): DashProps[] {
  const order = strokeOrder(el, m);
  const lengths = order.map((i) => m.lengths[i]);
  const cumulative: number[] = [];
  let acc = 0;
  for (const len of lengths) { cumulative.push(acc); acc += len; }
  const inOrder = dashPropsAt({ ...m, lengths, cumulative, total: acc }, p);
  const out: DashProps[] = new Array(order.length);
  order.forEach((orig, k) => { out[orig] = inOrder[k]; });
  return out;
}

// --- raster reveal masks ---------------------------------------------------

function revealMaskMarkup(el: DrawElement, p: number): string | null {
  if (!el.image) return null;
  const w = el.image.width, h = el.image.height;
  const mode = el.revealMode ?? 'scribble';
  const e = easeOutCubic(p);
  switch (mode) {
    case 'wipe': {
      const from: Direction = el.slideFrom ?? 'left';
      if (from === 'left') return `<rect x="0" y="0" width="${w * e}" height="${h}" fill="#fff"/>`;
      if (from === 'right') return `<rect x="${w * (1 - e)}" y="0" width="${w * e}" height="${h}" fill="#fff"/>`;
      if (from === 'top') return `<rect x="0" y="0" width="${w}" height="${h * e}" fill="#fff"/>`;
      return `<rect x="0" y="${h * (1 - e)}" width="${w}" height="${h * e}" fill="#fff"/>`;
    }
    case 'radial':
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.hypot(w, h) / 2 * e}" fill="#fff"/>`;
    case 'center': {
      const rw = w * e, rh = h * e;
      return `<rect x="${(w - rw) / 2}" y="${(h - rh) / 2}" width="${rw}" height="${rh}" fill="#fff"/>`;
    }
    default:
      return null;
  }
}

// --- entrance / emphasis / exit ---------------------------------------------

function directionOffset(dir: Direction, view: { width: number; height: number }, e: number): { dx: number; dy: number } {
  const dist = dir === 'left' || dir === 'right' ? view.width : view.height;
  const sign = dir === 'left' || dir === 'top' ? -1 : 1;
  return {
    dx: dir === 'left' || dir === 'right' ? sign * dist * e : 0,
    dy: dir === 'top' || dir === 'bottom' ? sign * dist * e : 0,
  };
}

/** Clip rect covering `frac` of the local bounds from direction `dir`. */
function wipeClip(b: Rect, dir: Direction, frac: number): Rect {
  const pad = Math.max(b.width, b.height) * 0.05 + 4;
  const x0 = b.x - pad, y0 = b.y - pad, w = b.width + pad * 2, h = b.height + pad * 2;
  switch (dir) {
    case 'left': return { x: x0, y: y0, width: w * frac, height: h };
    case 'right': return { x: x0 + w * (1 - frac), y: y0, width: w * frac, height: h };
    case 'top': return { x: x0, y: y0, width: w, height: h * frac };
    default: return { x: x0, y: y0 + h * (1 - frac), width: w, height: h * frac };
  }
}

function entranceFrame(el: DrawElement, t: number, view: { width: number; height: number }): ElementFrame {
  const p = elementProgress(el, t);
  const m = el.kind === 'image' ? null : measurePaths(el.paths);
  const b = localBounds(el);

  const custom = pluginEffect('entrance', el.style);
  if (custom) return { ...FULL_FRAME, ...custom.frame({ el, p, t, base: FULL_FRAME, view: { x: 0, y: 0, ...view }, bounds: b }) };

  switch (el.style) {
    case 'appear':
      return FULL_FRAME;
    case 'fade':
      return { ...FULL_FRAME, groupOpacity: ease(p, el.easing) };
    case 'slide': {
      const e = 1 - ease(p, el.easing);
      return { ...FULL_FRAME, groupOpacity: Math.min(1, p * 4), ...directionOffset(el.slideFrom ?? 'left', view, e) };
    }
    case 'wipe':
      return p >= 1 ? FULL_FRAME : { ...FULL_FRAME, clip: wipeClip(b, el.slideFrom ?? 'left', ease(p, el.easing)) };
    case 'scale':
      return { ...FULL_FRAME, scale: Math.max(0.001, ease(p, el.easing)), groupOpacity: Math.min(1, p * 3) };
    case 'pop':
      return { ...FULL_FRAME, scale: Math.max(0.001, easeOutBack(p)), groupOpacity: Math.min(1, p * 4) };
    case 'bounce': {
      const e = easeOutBounce(p);
      return { ...FULL_FRAME, dy: -(view.height * 0.6) * (1 - e), groupOpacity: Math.min(1, p * 4) };
    }
    case 'typewriter': {
      const n = el.paths.length;
      return { ...FULL_FRAME, visibleCount: p >= 1 ? null : Math.floor(p * n) };
    }
    default: {
      // 'draw' — dash reveal; for raster images the dashes drive a scribble mask
      if (p >= 1) {
        let fillOpacity = 1;
        if (el.fillAfterDraw && el.kind !== 'image') {
          fillOpacity = Math.min(Math.max((t - drawEnd(el)) / FILL_FADE_SECONDS, 0), 1);
        }
        return { ...FULL_FRAME, fillOpacity };
      }
      if (el.kind === 'image') {
        const mask = revealMaskMarkup(el, p);
        if (mask) return { ...FULL_FRAME, revealMask: mask };
        return { ...FULL_FRAME, dashes: dashPropsAt(measurePaths(el.paths), p) };
      }
      return { ...FULL_FRAME, fillOpacity: 0, dashes: orderedDashes(el, m!, p) };
    }
  }
}

function applyEmphasis(el: DrawElement, t: number, frame: ElementFrame): ElementFrame {
  const w = emphasisWindow(el);
  const e = el.emphasis;
  if (!w || !e || t < w.start || t >= w.end) return frame;
  const per = Math.max(0.05, e.duration);
  const u = ((t - w.start) % per) / per; // 0..1 within the current repeat
  const b = localBounds(el);
  const custom = pluginEffect('emphasis', e.kind);
  if (custom) return { ...frame, ...custom.frame({ el, p: u, t, base: frame, view: { x: 0, y: 0, width: 0, height: 0 }, bounds: b }) };
  switch (e.kind) {
    case 'pulse':
      return { ...frame, scale: frame.scale * (1 + 0.1 * Math.sin(Math.PI * u)) };
    case 'shake': {
      const amp = Math.max(6, Math.min(b.width, b.height) * el.scale * 0.04);
      return { ...frame, dx: frame.dx + Math.sin(u * Math.PI * 8) * amp * Math.sin(Math.PI * u) };
    }
    case 'bounce': {
      const h = Math.max(20, b.height * el.scale * 0.2);
      return { ...frame, dy: frame.dy - Math.abs(Math.sin(Math.PI * u)) * h };
    }
    case 'spin':
      return { ...frame, rotate: frame.rotate + 360 * easeInOutCubic(u) };
    case 'grow':
      return { ...frame, scale: frame.scale * (1 + 0.25 * Math.sin(Math.PI * u)) };
    case 'highlight':
      return { ...frame, highlight: Math.sin(Math.PI * Math.min(1, u * 1.15)) };
    default:
      return frame;
  }
}

/** Returns null once the exit has finished (element gone). */
function applyExit(el: DrawElement, t: number, frame: ElementFrame, view: { width: number; height: number }): ElementFrame | null {
  const w = exitWindow(el);
  const x = el.exit;
  if (!w || !x || t < w.start) return frame;
  if (t >= w.end) return null;
  const p = Math.min(1, (t - w.start) / (w.end - w.start));
  const b = localBounds(el);
  const custom = pluginEffect('exit', x.kind);
  if (custom) return { ...frame, ...custom.frame({ el, p, t, base: frame, view: { x: 0, y: 0, ...view }, bounds: b }) };
  switch (x.kind) {
    case 'fade':
      return { ...frame, groupOpacity: frame.groupOpacity * (1 - easeInCubic(p)) };
    case 'slide': {
      const off = directionOffset(x.direction, view, easeInCubic(p));
      return { ...frame, dx: frame.dx + off.dx, dy: frame.dy + off.dy };
    }
    case 'wipe': {
      // shrink toward the far side, i.e. reveal-in-reverse from the opposite direction
      const opposite: Direction = x.direction === 'left' ? 'right' : x.direction === 'right' ? 'left' : x.direction === 'top' ? 'bottom' : 'top';
      return { ...frame, clip: wipeClip(b, opposite, 1 - easeInCubic(p)) };
    }
    case 'shrink':
      return { ...frame, scale: frame.scale * Math.max(0.001, 1 - easeInCubic(p)), groupOpacity: frame.groupOpacity * Math.min(1, (1 - p) * 3) };
    case 'reverseDraw': {
      if (el.kind === 'image') {
        const mask = el.revealMode && el.revealMode !== 'scribble' ? revealMaskMarkup(el, 1 - p) : null;
        return mask ? { ...frame, revealMask: mask } : { ...frame, dashes: dashPropsAt(measurePaths(el.paths), 1 - p) };
      }
      return { ...frame, fillOpacity: 0, dashes: orderedDashes(el, measurePaths(el.paths), 1 - p) };
    }
    case 'erase': {
      const d = eraseScribble(b);
      const m = measurePaths([d]);
      const dash = dashPropsAt(m, p)[0];
      return { ...frame, erase: { d, strokeWidth: scribbleStrokeWidth(b.width, b.height), dash } };
    }
    default:
      return frame;
  }
}

/** Scribble covering the local bounds, used by the erase exit. */
export function eraseScribble(b: Rect): string {
  const pad = Math.max(b.width, b.height) * 0.06;
  const w = b.width + pad * 2, h = b.height + pad * 2;
  // scribblePath is anchored at the origin; shift it over the bounds
  return scribblePath(w, h).replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, c, x, y) =>
    `${c}${(parseFloat(x) + b.x - pad).toFixed(1)} ${(parseFloat(y) + b.y - pad).toFixed(1)}`);
}

/**
 * Reveal state of an element at time t. `view` is the camera frame at t
 * (needed so slide-ins start just outside the visible picture).
 * Returns null when the element is not visible (not yet, hidden, or exited).
 */
export function elementFrameAt(
  el: DrawElement,
  t: number,
  view: { width: number; height: number },
): ElementFrame | null {
  if (el.hidden || t < el.startTime) return null;
  let frame = entranceFrame(el, t, view);
  frame = applyEmphasis(el, t, frame);
  const after = applyExit(el, t, frame, view);
  if (!after) return null;
  const op = el.opacity ?? 1;
  return op === 1 ? after : { ...after, groupOpacity: after.groupOpacity * op };
}

/** Stacking order: play order plus the per-element layer offset. */
export function sortedByZ(elements: DrawElement[]): DrawElement[] {
  return [...elements].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || a.zIndex - b.zIndex);
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export interface SceneSpan {
  scene: Scene;
  index: number;
  /** when the scene takes over the picture (its first element's transition begins) */
  start: number;
  end: number;
}

export function buildSceneSpans(ordered: DrawElement[], project: Project): SceneSpan[] {
  const scenes = project.scenes ?? [];
  if (scenes.length === 0) return [];
  const spans: SceneSpan[] = [];
  scenes.forEach((scene, index) => {
    const members = ordered.filter((e) => e.sceneId === scene.id);
    if (members.length === 0) return;
    const first = members[0];
    const start = index === 0 || spans.length === 0 ? 0 : Math.max(0, first.startTime - first.transitionIn);
    const end = members.reduce((m, e) => Math.max(m, slotEnd(e)), 0);
    spans.push({ scene, index, start, end });
  });
  // a scene's end is the next scene's start
  for (let i = 0; i < spans.length - 1; i++) spans[i].end = spans[i + 1].start;
  if (spans.length) spans[spans.length - 1].end = Infinity;
  return spans;
}

export function sceneAt(t: number, spans: SceneSpan[]): SceneSpan | null {
  let cur: SceneSpan | null = null;
  for (const s of spans) { if (s.start <= t) cur = s; else break; }
  return cur;
}

/** Scene-transition overlay at t: a paper-coloured wash (fade) or sweep (wipe). */
export function sceneOverlayAt(t: number, spans: SceneSpan[]): { kind: 'fade' | 'wipe'; amount: number; color?: string } | null {
  const cur = sceneAt(t, spans);
  if (!cur || cur.index === 0 || cur.scene.transition === 'cut') {
    // a transition also runs *into* the next scene, before it starts
    const next = spans.find((s) => s.start > t);
    if (!next || next.scene.transition === 'cut') return null;
    const d = Math.max(0.1, next.scene.transitionDuration);
    if (t < next.start - d / 2) return null;
    const p = (t - (next.start - d / 2)) / (d / 2); // 0..1 approaching the cut
    return { kind: next.scene.transition, amount: next.scene.transition === 'fade' ? p : p * 0.5, color: next.scene.background };
  }
  const d = Math.max(0.1, cur.scene.transitionDuration);
  if (t >= cur.start + d / 2) {
    const next = spans.find((s) => s.start > t);
    if (!next || next.scene.transition === 'cut') return null;
    const nd = Math.max(0.1, next.scene.transitionDuration);
    if (t < next.start - nd / 2) return null;
    const p = (t - (next.start - nd / 2)) / (nd / 2);
    return { kind: next.scene.transition, amount: next.scene.transition === 'fade' ? p : p * 0.5, color: next.scene.background };
  }
  const p = (t - cur.start) / (d / 2); // 0..1 after the cut
  return { kind: cur.scene.transition, amount: cur.scene.transition === 'fade' ? 1 - p : 0.5 + p * 0.5, color: cur.scene.background };
}

/** Elements that a "clear before" scene has wiped off the board by time t. */
function clearedBefore(t: number, spans: SceneSpan[]): number {
  let cleared = -1;
  for (const s of spans) {
    if (s.start <= t && s.scene.clearBefore) cleared = s.index;
  }
  return cleared;
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

export interface HandFrame {
  def: HandDef;
  x: number;      // pen tip, canvas coords
  y: number;
  scale: number;  // canvas units per image pixel
  /** hand image offset from the tip, in fractions of the hand height */
  offset: { x: number; y: number };
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function tipPointOn(el: DrawElement, m: PathMeasure, progress: number, order?: number[]): { x: number; y: number } | null {
  let pose;
  if (order && order.some((v, i) => v !== i)) {
    // walk the ordered lengths to find the active sub-path, then sample it
    const total = m.total * Math.min(Math.max(progress, 0), 1);
    let acc = 0;
    for (const i of order) {
      const len = m.lengths[i];
      if (total <= acc + len || i === order[order.length - 1]) {
        const local = Math.min(Math.max(total - acc, 0), len);
        const pt = pointAt(m, i, local);
        pose = pt ? { x: pt.x, y: pt.y, angle: 0 } : null;
        break;
      }
      acc += len;
    }
  } else {
    pose = handTransformAt(m, progress);
  }
  if (!pose) return null;
  return applyTransform(pose.x, pose.y, el.x, el.y, el.rotation, el.scale);
}

function tipPoint(el: DrawElement, progress: number): { x: number; y: number } | null {
  const m = measurePaths(el.paths);
  return tipPointOn(el, m, progress, el.kind === 'image' ? undefined : strokeOrder(el, m));
}

/** Point on the erase scribble (local → canvas) at progress p. */
function eraseTip(el: DrawElement, p: number): { x: number; y: number } | null {
  const d = eraseScribble(localBounds(el));
  const m = measurePaths([d]);
  const pose = handTransformAt(m, p);
  return pose ? applyTransform(pose.x, pose.y, el.x, el.y, el.rotation, el.scale) : null;
}

/** Hand-driven activity of an element at time t: drawing, reverse-drawing or erasing. */
function handActivity(el: DrawElement, t: number): { kind: 'draw' | 'reverse' | 'erase'; start: number; end: number } | null {
  if (el.hidden) return null;
  const margin = Math.max(HAND_IN_SECONDS, HAND_OUT_SECONDS) + 5; // generous: callers re-check the real windows
  if (el.style === 'draw') {
    const start = el.startTime, end = drawEnd(el);
    if (t >= start - margin && t < end + HAND_OUT_SECONDS) return { kind: 'draw', start, end };
  }
  const x = exitWindow(el);
  if (x && el.exit && (el.exit.kind === 'reverseDraw' || el.exit.kind === 'erase')) {
    if (t >= x.start - margin && t < x.end + HAND_OUT_SECONDS) {
      return { kind: el.exit.kind === 'erase' ? 'erase' : 'reverse', start: x.start, end: x.end };
    }
  }
  return null;
}

/**
 * Where the hand is at time t. Sequence per element: slide in from off-screen
 * (lower right of the camera frame) just before drawing starts, follow the
 * pen tip while drawing, then slide back out. Hand size is constant on screen,
 * so its canvas-space scale depends on the camera zoom.
 */
export function handFrameAt(
  ordered: DrawElement[],
  t: number,
  project: Project,
  timeline: CameraTimeline,
): HandFrame | null {
  const cam = cameraAt(t, timeline, project);
  const vb = viewBoxFor(cam, project);
  // the hand waits just outside the frame on the side its arm comes from
  const offscreenFor = (def: HandDef) => ({ x: def.mirror ? vb.x - vb.width * 0.08 : vb.x + vb.width * 1.08, y: vb.y + vb.height * 1.08 });
  const offset = project.handOffset ?? { x: 0, y: 0 };
  const smoothing = Math.min(1, Math.max(0, project.handSmoothing ?? 0));

  const place = (def: HandDef, pt: { x: number; y: number }): HandFrame => ({
    def,
    x: pt.x,
    y: pt.y,
    scale: (def.frameFraction * vb.height) / def.height,
    offset,
  });

  // smoothed tip: average a few samples just behind t (deterministic)
  const tipAt = (sample: (time: number) => { x: number; y: number } | null, time: number, start: number) => {
    const now = sample(time);
    if (!now || smoothing <= 0) return now;
    const n = 1 + Math.round(smoothing * 6);
    const step = 0.012 + smoothing * 0.03;
    let sx = 0, sy = 0, sw = 0;
    for (let k = 0; k < n; k++) {
      const tt = Math.max(start, time - k * step);
      const p = sample(tt);
      if (!p) continue;
      const w = n - k;
      sx += p.x * w; sy += p.y * w; sw += w;
    }
    return sw ? { x: sx / sw, y: sy / sw } : now;
  };

  let leaving: HandFrame | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];
    const act = handActivity(el, t);
    if (!act) continue;
    const style: HandStyle = el.hand ?? project.hand;
    const def = handDef(style, project);
    if (!def) continue;
    const offscreen = offscreenFor(def);

    const { start, end } = act;
    const sample = (time: number) => {
      const p = Math.min(1, Math.max(0, (time - start) / Math.max(end - start, 1e-6)));
      if (act.kind === 'draw') return tipPoint(el, p);
      if (act.kind === 'reverse') return tipPoint(el, 1 - p);
      return eraseTip(el, p);
    };

    if (t >= start && t < end) {
      const pt = tipAt(sample, t, start);
      return pt ? place(def, pt) : null;
    }

    // sliding in
    const inDur = Math.min(HAND_IN_SECONDS, act.kind === 'draw' ? (i === 0 ? start : el.transitionIn) : HAND_IN_SECONDS);
    if (inDur > 0 && t >= start - inDur && t < start) {
      const pt = sample(start);
      if (!pt) continue;
      const p = easeInOut((t - (start - inDur)) / inDur);
      return place(def, {
        x: offscreen.x + (pt.x - offscreen.x) * p,
        y: offscreen.y + (pt.y - offscreen.y) * p,
      });
    }

    // sliding out (lower priority than the next element's entrance)
    const next = ordered[i + 1];
    const window = act.kind === 'draw' ? el.pauseAfter + (next ? next.transitionIn : HAND_OUT_SECONDS) : HAND_OUT_SECONDS;
    const outDur = Math.min(HAND_OUT_SECONDS, window);
    if (outDur > 0 && t >= end && t < end + outDur) {
      const pt = sample(end);
      if (!pt) continue;
      const p = easeInOut((t - end) / outDur);
      leaving = place(def, {
        x: pt.x + (offscreen.x - pt.x) * p,
        y: pt.y + (offscreen.y - pt.y) * p,
      });
    }
  }
  return leaving;
}

/** SVG transform string that puts the hand's pen tip at (x, y). */
export function handTransform(h: HandFrame): string {
  const ox = h.offset.x * h.def.height, oy = h.offset.y * h.def.height;
  return `translate(${h.x} ${h.y}) scale(${h.scale}) translate(${-h.def.tipX + ox} ${-h.def.tipY + oy})`;
}

// ---------------------------------------------------------------------------
// Element markup helpers (shared by the live canvas and the export string)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function elementTransform(el: DrawElement, frame: ElementFrame): string {
  const sx = el.scale * frame.scale * (el.flipX ? -1 : 1);
  const sy = el.scale * frame.scale * (el.flipY ? -1 : 1);
  return `translate(${el.x + frame.dx} ${el.y + frame.dy}) rotate(${el.rotation + frame.rotate}) scale(${sx} ${sy})`;
}

/** Image clip rectangle (crop) in image px, or null when uncropped. */
function cropRect(el: DrawElement): Rect | null {
  if (!el.image || !el.crop) return null;
  const c = el.crop;
  const w = el.image.width, h = el.image.height;
  if (!c.left && !c.top && !c.right && !c.bottom) return null;
  return { x: w * c.left, y: h * c.top, width: w * (1 - c.left - c.right), height: h * (1 - c.top - c.bottom) };
}

/** Inner SVG markup for one element (paths, or a masked image). */
export function elementInnerSvg(el: DrawElement, frame: ElementFrame): string {
  let out = '';
  const b = localBounds(el);
  const uid = el.id;

  // highlight wash behind the artwork
  if (frame.highlight > 0) {
    const pad = Math.max(b.width, b.height) * 0.08 + 6;
    out +=
      `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" ` +
      `rx="${pad}" fill="#ffe14d" opacity="${(0.55 * frame.highlight).toFixed(3)}"/>`;
  }

  // clip (wipe) and erase masks wrap the artwork
  let open = '', close = '';
  if (frame.clip) {
    const c = frame.clip;
    out += `<clipPath id="clip-${uid}"><rect x="${c.x}" y="${c.y}" width="${Math.max(0, c.width)}" height="${Math.max(0, c.height)}"/></clipPath>`;
    open += `<g clip-path="url(#clip-${uid})">`; close = '</g>' + close;
  }
  if (frame.erase) {
    const e = frame.erase;
    const pad = Math.max(b.width, b.height) * 0.1 + 10;
    out +=
      `<mask id="erase-${uid}" maskUnits="userSpaceOnUse" x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}">` +
      `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="#fff"/>` +
      `<path d="${esc(e.d)}" fill="none" stroke="#000" stroke-width="${e.strokeWidth}" stroke-linecap="round" ` +
      `stroke-dasharray="${e.dash.strokeDasharray}" stroke-dashoffset="${e.dash.strokeDashoffset}"/></mask>`;
    open += `<g mask="url(#erase-${uid})">`; close = '</g>' + close;
  }

  if (el.kind === 'image' && el.image) {
    const maskId = `reveal-${uid}`;
    const sw = scribbleStrokeWidth(el.image.width, el.image.height);
    let inner = '';
    const masked = !!(frame.dashes || frame.revealMask);
    if (masked) {
      inner += `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${el.image.width}" height="${el.image.height}">`;
      if (frame.revealMask) inner += frame.revealMask;
      else {
        el.paths.forEach((d, i) => {
          const dash = frame.dashes![i];
          inner +=
            `<path d="${esc(d)}" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" ` +
            `stroke-dasharray="${dash.strokeDasharray}" stroke-dashoffset="${dash.strokeDashoffset}"/>`;
        });
      }
      inner += '</mask>';
    }
    const crop = cropRect(el);
    if (crop) {
      inner += `<clipPath id="crop-${uid}"><rect x="${crop.x}" y="${crop.y}" width="${crop.width}" height="${crop.height}"/></clipPath>`;
    }
    inner +=
      `<image href="${el.image.src}" width="${el.image.width}" height="${el.image.height}" ` +
      `preserveAspectRatio="none"${masked ? ` mask="url(#${maskId})"` : ''}${crop ? ` clip-path="url(#crop-${uid})"` : ''}/>`;
    return out + open + inner + close;
  }

  const paths = el.paths
    .map((d, i) => {
      if (frame.visibleCount !== null && i >= frame.visibleCount) return '';
      const dash = frame.dashes?.[i];
      const dashAttrs = dash
        ? ` stroke-dasharray="${dash.strokeDasharray}" stroke-dashoffset="${dash.strokeDashoffset}"`
        : '';
      const { fill, stroke } = pathColors(el, i);
      return (
        `<path d="${esc(d)}" fill="${esc(fill)}" fill-opacity="${frame.fillOpacity}" fill-rule="${el.fillRule ?? 'nonzero'}" ` +
        `stroke="${esc(stroke)}" stroke-width="${el.strokeWidth / el.scale}" ` +
        `stroke-linecap="round" stroke-linejoin="round"${dashAttrs}/>`
      );
    })
    .join('');
  return out + open + paths + close;
}

/**
 * Colours for path i. Imported coloured artwork keeps its own fills; a
 * fill-only shape borrows its fill as the stroke so the hand has a line to
 * draw before the fill appears.
 */
export function pathColors(el: DrawElement, i: number): { fill: string; stroke: string } {
  const pf = el.pathFills?.[i];
  const ps = el.pathStrokes?.[i];
  const fill = pf ?? el.fillColor;
  let stroke = ps ?? el.strokeColor;
  if (ps === 'none' || (ps == null && el.pathFills && fill !== 'none')) stroke = fill;
  if (ps === 'none' && fill === 'none') stroke = el.strokeColor;
  return { fill, stroke };
}

// ---------------------------------------------------------------------------
// Full-frame SVG string rendering (used by export, spec §8). Text is already
// converted to paths and images are data: URLs, so the SVG is self-contained.
// ---------------------------------------------------------------------------

export interface RenderContext {
  project: Project;
  /** play order, hidden elements excluded */
  ordered: DrawElement[];
  /** stacking order, hidden elements excluded */
  stacked: DrawElement[];
  timeline: CameraTimeline;
  scenes: SceneSpan[];
}

export function makeRenderContext(project: Project, elements: DrawElement[]): RenderContext {
  const visible = elements.filter((e) => !e.hidden);
  const ordered = [...visible].sort((a, b) => a.zIndex - b.zIndex);
  return {
    project,
    ordered,
    stacked: sortedByZ(visible),
    timeline: buildCameraTimeline(ordered, project),
    scenes: buildSceneSpans(ordered, project),
  };
}

/** Elements drawn at t, in stacking order, honouring "clear before" scenes. */
export function visibleAt(ctx: RenderContext, t: number): DrawElement[] {
  if (ctx.scenes.length === 0) return ctx.stacked;
  const cleared = clearedBefore(t, ctx.scenes);
  if (cleared < 0) return ctx.stacked;
  const keep = new Set(ctx.scenes.filter((s) => s.index >= cleared).map((s) => s.scene.id));
  return ctx.stacked.filter((e) => !e.sceneId || keep.has(e.sceneId));
}

/** Paper (style + colour) in force at time t. */
export function paperAt(ctx: RenderContext, t: number): { paper: Project['paper']; background: string } {
  const s = sceneAt(t, ctx.scenes);
  return {
    paper: s?.scene.paper ?? ctx.project.paper,
    background: s?.scene.background ?? ctx.project.background,
  };
}

export function svgStringForTime(
  ctx: RenderContext,
  t: number,
  outWidth: number,
  outHeight: number,
  handImages: Partial<Record<HandStyle, string>>,
): string {
  const { project, ordered, timeline } = ctx;
  const cam = cameraAt(t, timeline, project);
  const vb = viewBoxFor(cam, project);
  const { paper: paperId, background } = paperAt(ctx, t);
  const paper = paperDef(paperId);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${outWidth}" height="${outHeight}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}">`,
  );
  const defs = paper.defs(background);
  if (defs) parts.push(`<defs>${defs}</defs>`);
  parts.push(
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" ` +
      `fill="${esc(paper.fill(background))}"/>`,
  );

  for (const el of visibleAt(ctx, t)) {
    const frame = elementFrameAt(el, t, vb);
    if (!frame) continue;
    parts.push(`<g transform="${elementTransform(el, frame)}" opacity="${frame.groupOpacity}">`);
    parts.push(elementInnerSvg(el, frame));
    parts.push('</g>');
  }

  const hand = handFrameAt(ordered, t, project, timeline);
  if (hand) {
    const href = handImages[hand.def.id] ?? hand.def.src;
    if (href) {
      parts.push(`<g transform="${handTransform(hand)}">${handInnerSvg(hand.def, href)}</g>`);
    }
  }

  const overlay = sceneOverlayAt(t, ctx.scenes);
  if (overlay && overlay.amount > 0) {
    const color = esc(overlay.color ?? background);
    if (overlay.kind === 'fade') {
      parts.push(`<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="${color}" opacity="${overlay.amount.toFixed(3)}"/>`);
    } else {
      // wipe: a sheet sweeps across from the left and continues out to the right
      const a = overlay.amount; // 0..1 across the whole sweep
      const x = vb.x + vb.width * (a * 2 - 1);
      parts.push(`<rect x="${x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="${color}"/>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
