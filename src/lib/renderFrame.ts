// The canvas is a pure function of currentTime (spec §6). This module holds
// that function in data form: given the project and a time, what should be on
// screen — element reveal state, camera view, and hand pose. Both the live
// React canvas and the deterministic export pipeline consume these, so
// preview and exported video always match.

import type { DrawElement, HandStyle, Project } from '../types';
import { applyTransform, dashPropsAt, handTransformAt, measurePaths, type DashProps } from './drawing';
import { buildCameraTimeline, cameraAt, viewBoxFor, type CameraTimeline } from './camera';
import { handDef, handInnerSvg, type HandDef } from '../assets/hands';
import { paperDef } from '../assets/paper';
import { scribbleStrokeWidth } from './scribble';

export const FILL_FADE_SECONDS = 0.2;
const HAND_IN_SECONDS = 0.45;
const HAND_OUT_SECONDS = 0.35;

export interface ElementFrame {
  groupOpacity: number;
  fillOpacity: number;
  /** null → no dash manipulation (appear/fade/slide, or fully drawn) */
  dashes: DashProps[] | null;
  /** extra translation (slide-in), canvas units */
  dx: number;
  dy: number;
}

export const FULL_FRAME: ElementFrame = { groupOpacity: 1, fillOpacity: 1, dashes: null, dx: 0, dy: 0 };

export function elementProgress(el: DrawElement, t: number): number {
  if (t < el.startTime) return 0;
  if (el.drawDuration <= 0) return 1;
  return Math.min((t - el.startTime) / el.drawDuration, 1);
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * Reveal state of an element at time t. `view` is the camera frame at t
 * (needed so slide-ins start just outside the visible picture).
 * Returns null when the element is not visible yet.
 */
export function elementFrameAt(
  el: DrawElement,
  t: number,
  view: { width: number; height: number },
): ElementFrame | null {
  if (t < el.startTime) return null;
  const p = elementProgress(el, t);

  switch (el.style) {
    case 'appear':
      return FULL_FRAME;
    case 'fade':
      return { ...FULL_FRAME, groupOpacity: p };
    case 'slide': {
      const e = 1 - easeOutCubic(p);
      const dist = el.slideFrom === 'left' || el.slideFrom === 'right' ? view.width : view.height;
      const sign = el.slideFrom === 'left' || el.slideFrom === 'top' ? -1 : 1;
      return {
        ...FULL_FRAME,
        groupOpacity: Math.min(1, p * 4),
        dx: el.slideFrom === 'left' || el.slideFrom === 'right' ? sign * dist * e : 0,
        dy: el.slideFrom === 'top' || el.slideFrom === 'bottom' ? sign * dist * e : 0,
      };
    }
    default: {
      // 'draw' — dash reveal; for raster images the dashes drive a scribble mask
      const m = measurePaths(el.paths);
      if (p >= 1) {
        let fillOpacity = 1;
        if (el.fillAfterDraw && el.kind !== 'image') {
          const done = el.startTime + el.drawDuration;
          fillOpacity = Math.min(Math.max((t - done) / FILL_FADE_SECONDS, 0), 1);
        }
        return { ...FULL_FRAME, fillOpacity };
      }
      return { ...FULL_FRAME, fillOpacity: el.kind === 'image' ? 1 : 0, dashes: dashPropsAt(m, p) };
    }
  }
}

export function sortedByZ(elements: DrawElement[]): DrawElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

export interface HandFrame {
  def: HandDef;
  x: number;      // pen tip, canvas coords
  y: number;
  scale: number;  // canvas units per image pixel
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function tipPoint(el: DrawElement, progress: number): { x: number; y: number } | null {
  const m = measurePaths(el.paths);
  const pose = handTransformAt(m, progress);
  if (!pose) return null;
  return applyTransform(pose.x, pose.y, el.x, el.y, el.rotation, el.scale);
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
  const offscreen = { x: vb.x + vb.width * 1.08, y: vb.y + vb.height * 1.08 };

  const place = (def: HandDef, pt: { x: number; y: number }): HandFrame => ({
    def,
    x: pt.x,
    y: pt.y,
    scale: (def.frameFraction * vb.height) / def.height,
  });

  let leaving: HandFrame | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];
    if (el.style !== 'draw') continue;
    const style: HandStyle = el.hand ?? project.hand;
    const def = handDef(style);
    if (!def) continue;

    const start = el.startTime;
    const end = start + el.drawDuration;

    if (t >= start && t < end) {
      const pt = tipPoint(el, elementProgress(el, t));
      return pt ? place(def, pt) : null;
    }

    // sliding in
    const inDur = Math.min(HAND_IN_SECONDS, i === 0 ? start : el.transitionIn);
    if (inDur > 0 && t >= start - inDur && t < start) {
      const pt = tipPoint(el, 0);
      if (!pt) continue;
      const p = easeInOut((t - (start - inDur)) / inDur);
      return place(def, {
        x: offscreen.x + (pt.x - offscreen.x) * p,
        y: offscreen.y + (pt.y - offscreen.y) * p,
      });
    }

    // sliding out (lower priority than the next element's entrance)
    const next = ordered[i + 1];
    const window = el.pauseAfter + (next ? next.transitionIn : HAND_OUT_SECONDS);
    const outDur = Math.min(HAND_OUT_SECONDS, window);
    if (outDur > 0 && t >= end && t < end + outDur) {
      const pt = tipPoint(el, 1);
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
  return `translate(${h.x} ${h.y}) scale(${h.scale}) translate(${-h.def.tipX} ${-h.def.tipY})`;
}

// ---------------------------------------------------------------------------
// Element markup helpers (shared by the live canvas and the export string)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function elementTransform(el: DrawElement, frame: ElementFrame): string {
  return `translate(${el.x + frame.dx} ${el.y + frame.dy}) rotate(${el.rotation}) scale(${el.scale})`;
}

/** Inner SVG markup for one element (paths, or a masked image). */
export function elementInnerSvg(el: DrawElement, frame: ElementFrame): string {
  if (el.kind === 'image' && el.image) {
    const maskId = `reveal-${el.id}`;
    const sw = scribbleStrokeWidth(el.image.width, el.image.height);
    let out = '';
    if (frame.dashes) {
      out += `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${el.image.width}" height="${el.image.height}">`;
      el.paths.forEach((d, i) => {
        const dash = frame.dashes![i];
        out +=
          `<path d="${esc(d)}" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" ` +
          `stroke-dasharray="${dash.strokeDasharray}" stroke-dashoffset="${dash.strokeDashoffset}"/>`;
      });
      out += '</mask>';
    }
    out +=
      `<image href="${el.image.src}" width="${el.image.width}" height="${el.image.height}" ` +
      `preserveAspectRatio="none"${frame.dashes ? ` mask="url(#${maskId})"` : ''}/>`;
    return out;
  }
  return el.paths
    .map((d, i) => {
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
  ordered: DrawElement[];
  timeline: CameraTimeline;
}

export function makeRenderContext(project: Project, elements: DrawElement[]): RenderContext {
  const ordered = sortedByZ(elements);
  return { project, ordered, timeline: buildCameraTimeline(ordered, project) };
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
  const paper = paperDef(project.paper);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${outWidth}" height="${outHeight}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}">`,
  );
  const defs = paper.defs(project.background);
  if (defs) parts.push(`<defs>${defs}</defs>`);
  parts.push(
    `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" ` +
      `fill="${esc(paper.fill(project.background))}"/>`,
  );

  for (const el of ordered) {
    const frame = elementFrameAt(el, t, vb);
    if (!frame) continue;
    parts.push(`<g transform="${elementTransform(el, frame)}" opacity="${frame.groupOpacity}">`);
    parts.push(elementInnerSvg(el, frame));
    parts.push('</g>');
  }

  const hand = handFrameAt(ordered, t, project, timeline);
  if (hand) {
    const href = handImages[hand.def.id];
    if (href) {
      parts.push(`<g transform="${handTransform(hand)}">${handInnerSvg(hand.def, href)}</g>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
