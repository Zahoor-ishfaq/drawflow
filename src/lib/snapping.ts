// Timeline snapping: while dragging a time value, pull it onto nearby
// markers, clip edges, element boundaries, the playhead and whole seconds.

import type { AudioClip, DrawElement, Marker } from '../types';
import { slotEnd, drawEnd } from './timing';

export interface SnapTargets {
  times: number[];
}

export function collectSnapTargets(opts: {
  elements: DrawElement[];
  clips: AudioClip[];
  markers: Marker[];
  playhead: number;
  /** ids to leave out (the thing being dragged) */
  excludeElementIds?: string[];
  excludeClipIds?: string[];
  /** add whole seconds when zoomed in enough that they are meaningful */
  pxPerSec?: number;
  duration?: number;
}): number[] {
  const out = new Set<number>([0, opts.playhead]);
  const ex = new Set(opts.excludeElementIds ?? []);
  const exc = new Set(opts.excludeClipIds ?? []);
  for (const el of opts.elements) {
    if (ex.has(el.id) || el.hidden) continue;
    out.add(el.startTime);
    out.add(drawEnd(el));
    out.add(slotEnd(el));
  }
  for (const c of opts.clips) {
    if (exc.has(c.id)) continue;
    out.add(c.startTime);
    out.add(c.startTime + c.duration);
  }
  for (const m of opts.markers) out.add(m.time);
  if (opts.pxPerSec && opts.pxPerSec >= 40 && opts.duration) {
    for (let s = 0; s <= Math.ceil(opts.duration); s++) out.add(s);
  }
  return Array.from(out).filter((t) => Number.isFinite(t) && t >= 0);
}

/** Nearest target within `tolerancePx`, or the value unchanged. */
export function snapTime(t: number, targets: number[], pxPerSec: number, tolerancePx = 7): { t: number; snapped: number | null } {
  if (pxPerSec <= 0) return { t, snapped: null };
  const tol = tolerancePx / pxPerSec;
  let best: number | null = null;
  let bestD = tol;
  for (const x of targets) {
    const d = Math.abs(x - t);
    if (d < bestD) { bestD = d; best = x; }
  }
  return best === null ? { t, snapped: null } : { t: best, snapped: best };
}
