// VideoScribe-style camera: every element has a camera position; the view
// travels there during the element's transition, holds while it draws and
// pauses, then moves on. At the end it optionally pulls back to the whole
// artboard. Everything is a pure function of time so preview and export match.

import type { CameraEasing, CameraView, DrawElement, Project } from '../types';
import { applyTransform, measurePaths } from './drawing';

export const END_ZOOM_SECONDS = 1.2;
/** an auto-framed element fills roughly this fraction of the frame */
const AUTO_FILL = 0.5;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

export function wholeView(project: Project): CameraView {
  return { cx: project.width / 2, cy: project.height / 2, zoom: 1 };
}

/** Union of element bounds (canvas coords), or null when there are none. */
export function unionBounds(elements: DrawElement[]): Bounds | null {
  if (elements.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of elements) {
    const b = elementBounds(el);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Camera that shows the whole scribe: everything the user placed, wherever
 * it is on the infinite paper, with a little breathing room. Never zooms in
 * past the frame size, so a small cluster is shown at 1:1.
 */
export function overviewView(elements: DrawElement[], project: Project): CameraView {
  const u = unionBounds(elements);
  if (!u) return wholeView(project);
  const pad = 1.12;
  const zoom = Math.min(
    project.width / Math.max(u.width * pad, 1),
    project.height / Math.max(u.height * pad, 1),
    1,
  );
  return { cx: u.x + u.width / 2, cy: u.y + u.height / 2, zoom: Math.max(zoom, 0.02) };
}

export interface Bounds { x: number; y: number; width: number; height: number }

/** Element bounding box in canvas coordinates (transform applied). */
export function elementBounds(el: DrawElement): Bounds {
  const b = measurePaths(el.paths).bbox;
  const corners = [
    [b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height],
  ].map(([px, py]) => applyTransform(px, py, el.x, el.y, el.rotation, el.scale));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function autoCamera(el: DrawElement, project: Project): CameraView {
  const b = elementBounds(el);
  const w = Math.max(b.width, 40);
  const h = Math.max(b.height, 40);
  const fill = (project.cameraFill ?? AUTO_FILL) * Math.min(Math.max(el.cameraZoom, 0.25), 3);
  const zoom = Math.min((project.width * fill) / w, (project.height * fill) / h);
  return {
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
    zoom: Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM),
  };
}

/** Camera for element `index` of the play-ordered list. */
export function cameraForElement(index: number, ordered: DrawElement[], project: Project): CameraView {
  const el = ordered[index];
  switch (el.camera) {
    case 'whole': return overviewView(ordered, project);
    case 'custom': return el.customCamera ?? autoCamera(el, project);
    case 'previous':
      return index > 0 ? cameraForElement(index - 1, ordered, project) : autoCamera(el, project);
    default: return autoCamera(el, project);
  }
}

export interface CameraKey {
  view: CameraView;
  moveStart: number; // camera begins travelling toward `view`
  moveEnd: number;   // camera arrives
}

export interface CameraTimeline {
  keys: CameraKey[];
  /** time at which all element activity (incl. last pause) is over */
  contentEnd: number;
}

export function buildCameraTimeline(ordered: DrawElement[], project: Project): CameraTimeline {
  const keys: CameraKey[] = [];
  let contentEnd = 0;
  ordered.forEach((el, i) => {
    const view = cameraForElement(i, ordered, project);
    const moveEnd = el.startTime;
    const moveStart = i === 0 ? 0 : Math.max(0, el.startTime - el.transitionIn);
    keys.push({ view, moveStart, moveEnd });
    contentEnd = Math.max(contentEnd, el.startTime + el.drawDuration + el.pauseAfter);
  });
  if (project.zoomAtEnd && ordered.length > 0) {
    keys.push({
      view: overviewView(ordered, project),
      moveStart: contentEnd,
      moveEnd: contentEnd + END_ZOOM_SECONDS,
    });
  }
  return { keys, contentEnd };
}

function ease(p: number, easing: CameraEasing): number {
  if (easing === 'linear') return p;
  if (easing === 'cut') return p >= 1 ? 1 : 0;
  return 1 - Math.pow(1 - p, 3); // ease-out cubic
}

function lerpView(a: CameraView, b: CameraView, p: number): CameraView {
  return {
    cx: a.cx + (b.cx - a.cx) * p,
    cy: a.cy + (b.cy - a.cy) * p,
    zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * p),
  };
}

export function cameraAt(t: number, timeline: CameraTimeline, project: Project): CameraView {
  const { keys } = timeline;
  if (keys.length === 0) return wholeView(project);
  let idx = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].moveStart <= t) idx = i;
    else break;
  }
  if (idx === -1) return keys[0].view;
  const key = keys[idx];
  if (t >= key.moveEnd || key.moveEnd <= key.moveStart) return key.view;
  const from = idx > 0 ? keys[idx - 1].view : key.view;
  const p = (t - key.moveStart) / (key.moveEnd - key.moveStart);
  return lerpView(from, key.view, ease(Math.min(Math.max(p, 0), 1), project.cameraEasing));
}

/** Camera view whose frame is the given canvas rect (aspect forced to the video's). */
export function viewFromRect(r: { x: number; y: number; width: number; height: number }, project: Project): CameraView {
  const zoom = Math.max(0.02, Math.min(project.width / Math.max(r.width, 1), project.height / Math.max(r.height, 1)));
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, zoom };
}

/** viewBox numbers for a camera view. */
export function viewBoxFor(view: CameraView, project: Project) {
  const w = project.width / view.zoom;
  const h = project.height / view.zoom;
  return { x: view.cx - w / 2, y: view.cy - h / 2, width: w, height: h };
}
