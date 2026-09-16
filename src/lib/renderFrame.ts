// The canvas is a pure function of currentTime (spec §6). This module holds
// that function in data form: given the project and a time, what should be on
// screen — element reveal state, camera view, and hand pose. Both the live
// React canvas and the deterministic export pipeline consume these, so
// preview and exported video always match.

import type { DrawElement, HandStyle, Project } from '../types';
import { applyTransform, dashPropsAt, handTransformAt, measurePaths, type DashProps } from './drawing';
import { buildCameraTimeline, cameraAt, viewBoxFor, type CameraTimeline } from './camera';
import { handDef, type HandDef } from '../assets/hands';
import { paperDef } from '../assets/paper';

export const FILL_FADE_SECONDS = 0.2;
const HAND_IN_SECONDS = 0.45;
const HAND_OUT_SECONDS = 0.35;

export interface ElementFrame {
  groupOpacity: number;
  fillOpacity: number;
  /** null → no dash manipulation (appear/fade, or fully drawn) */
  dashes: DashProps[] | null;
}

export function elementProgress(el: DrawElement, t: number): number {
  if (t < el.startTime) return 0;
  if (el.drawDuration <= 0) return 1;
  return Math.min((t - el.startTime) / el.drawDuration, 1);
}

/** Returns null when the element is not visible at time t. */
export function elementFrameAt(el: DrawElement, t: number): ElementFrame | null {
  if (t < el.startTime) return null;
  const p = elementProgress(el, t);

  if (el.style === 'appear') {
    return { groupOpacity: 1, fillOpacity: 1, dashes: null };
  }
  if (el.style === 'fade') {
    return { groupOpacity: p, fillOpacity: 1, dashes: null };
  }

  // 'draw'
  const m = measurePaths(el.paths);
  if (p >= 1) {
    let fillOpacity = 1;
    if (el.fillAfterDraw) {
      const done = el.startTime + el.drawDuration;
      fillOpacity = Math.min(Math.max((t - done) / FILL_FADE_SECONDS, 0), 1);
    }
    return { groupOpacity: 1, fillOpacity, dashes: null };
  }
  return { groupOpacity: 1, fillOpacity: 0, dashes: dashPropsAt(m, p) };
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
// Full-frame description + SVG string rendering (used by export, spec §8).
// Text is already converted to paths, so the serialized SVG needs no fonts.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

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
    const frame = elementFrameAt(el, t);
    if (!frame) continue;
    parts.push(
      `<g transform="translate(${el.x} ${el.y}) rotate(${el.rotation}) scale(${el.scale})" ` +
        `opacity="${frame.groupOpacity}">`,
    );
    el.paths.forEach((d, i) => {
      const dash = frame.dashes?.[i];
      const dashAttrs = dash
        ? ` stroke-dasharray="${dash.strokeDasharray}" stroke-dashoffset="${dash.strokeDashoffset}"`
        : '';
      parts.push(
        `<path d="${esc(d)}" fill="${esc(el.fillColor)}" fill-opacity="${frame.fillOpacity}" ` +
          `stroke="${esc(el.strokeColor)}" stroke-width="${el.strokeWidth / el.scale}" ` +
          `stroke-linecap="round" stroke-linejoin="round"${dashAttrs}/>`,
      );
    });
    parts.push('</g>');
  }

  const hand = handFrameAt(ordered, t, project, timeline);
  if (hand) {
    const href = handImages[hand.def.id];
    if (href) {
      parts.push(
        `<image href="${href}" xlink:href="${href}" width="${hand.def.width}" height="${hand.def.height}" ` +
          `transform="${handTransform(hand)}"/>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
