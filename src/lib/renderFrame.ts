// The canvas is a pure function of currentTime (spec §6). This module holds
// that function in data form: given an element and a time, what should be on
// screen. Both the live React canvas and the deterministic export pipeline
// consume these, so preview and exported video always match.

import type { DrawElement, HandStyle, Project } from '../types';
import {
  applyTransform,
  dashPropsAt,
  handTransformAt,
  measurePaths,
  type DashProps,
} from './drawing';
import { HAND_ARTWORK, handScaleFor } from '../assets/hands';

export const FILL_FADE_SECONDS = 0.2;

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
  let fillOpacity = 0;
  if (p >= 1) {
    if (el.fillAfterDraw) {
      const done = el.startTime + el.drawDuration;
      fillOpacity = Math.min(Math.max((t - done) / FILL_FADE_SECONDS, 0), 1);
    } else {
      fillOpacity = 1;
    }
    return { groupOpacity: 1, fillOpacity, dashes: null };
  }
  return { groupOpacity: 1, fillOpacity: 0, dashes: dashPropsAt(m, p) };
}

export interface HandFrame {
  x: number;      // canvas coords
  y: number;
  angle: number;  // degrees
}

/**
 * The hand sits on the topmost element that is actively drawing at t
 * (style 'draw', 0 < p < 1). Returns canvas-space position/angle.
 */
export function handFrameAt(elements: DrawElement[], t: number): HandFrame | null {
  const active = elements
    .filter((el) => el.style === 'draw' && t >= el.startTime && elementProgress(el, t) < 1)
    .sort((a, b) => b.zIndex - a.zIndex)[0];
  if (!active) return null;
  const m = measurePaths(active.paths);
  const pose = handTransformAt(m, elementProgress(active, t));
  if (!pose) return null;
  const pt = applyTransform(pose.x, pose.y, active.x, active.y, active.rotation, active.scale);
  return { x: pt.x, y: pt.y, angle: pose.angle + active.rotation };
}

export function sortedByZ(elements: DrawElement[]): DrawElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

// ---------------------------------------------------------------------------
// SVG string rendering — used by the export pipeline (spec §8). Text is
// already converted to paths, so the serialized SVG needs no fonts.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function svgStringForTime(
  project: Project,
  elements: DrawElement[],
  handStyle: HandStyle,
  t: number,
  outWidth: number,
  outHeight: number,
): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" ` +
      `viewBox="0 0 ${project.width} ${project.height}">`,
  );
  parts.push(
    `<rect width="${project.width}" height="${project.height}" fill="${esc(project.background)}"/>`,
  );

  for (const el of sortedByZ(elements)) {
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

  if (handStyle !== 'none') {
    const hand = handFrameAt(elements, t);
    if (hand) {
      const s = handScaleFor(project);
      parts.push(
        `<g transform="translate(${hand.x} ${hand.y}) rotate(${hand.angle}) scale(${s})">`,
      );
      for (const part of HAND_ARTWORK[handStyle]) {
        parts.push(
          `<path d="${part.d}" fill="${part.fill}"` +
            (part.stroke ? ` stroke="${part.stroke}" stroke-width="${part.sw ?? 2}"` : '') +
            (part.t ? ` transform="${part.t}"` : '') +
            '/>',
        );
      }
      parts.push('</g>');
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
