// Where an element sits on the timeline, derived from its own settings.
// Slot = draw → emphasis → pause; the next element starts after the slot.
// An exit runs `exit.delay` seconds after the slot ends and may overlap
// later elements — it only extends the project length, never the chain.
// A motion path behaves the same way, starting after the element has appeared.

import type { DrawElement } from '../types';

/** Total seconds the emphasis effect occupies (0 when there is none). */
export function emphasisSpan(el: DrawElement): number {
  const e = el.emphasis;
  if (!e) return 0;
  return Math.max(0, e.delay) + Math.max(0, e.duration) * Math.max(1, Math.round(e.repeat));
}

export function drawEnd(el: DrawElement): number {
  return el.startTime + el.drawDuration;
}

/** When the emphasis starts / ends (absolute seconds), or null. */
export function emphasisWindow(el: DrawElement): { start: number; end: number } | null {
  const e = el.emphasis;
  if (!e) return null;
  const start = drawEnd(el) + Math.max(0, e.delay);
  return { start, end: start + Math.max(0, e.duration) * Math.max(1, Math.round(e.repeat)) };
}

/** End of the element's slot: drawing, emphasis and the pause after it. */
export function slotEnd(el: DrawElement): number {
  return drawEnd(el) + emphasisSpan(el) + el.pauseAfter;
}

export function exitWindow(el: DrawElement): { start: number; end: number } | null {
  const x = el.exit;
  if (!x) return null;
  const start = slotEnd(el) + Math.max(0, x.delay);
  return { start, end: start + Math.max(0.05, x.duration) };
}

/**
 * When the element travels its motion path (absolute seconds), or null. It sets
 * off `delay` seconds after it has appeared and, like an exit, runs alongside
 * later elements instead of holding them up.
 */
export function motionWindow(el: DrawElement): { start: number; end: number } | null {
  const m = el.motion;
  if (!m || !m.points || m.points.length < 2) return null;
  const start = drawEnd(el) + Math.max(0, m.delay);
  return { start, end: start + Math.max(0.1, m.duration) };
}

/** Last moment the element affects the picture. */
export function elementEnd(el: DrawElement): number {
  const x = exitWindow(el);
  const m = motionWindow(el);
  return Math.max(slotEnd(el), x ? x.end : 0, m ? m.end : 0);
}

/** True once the exit has completely finished (element is gone). */
export function hasExited(el: DrawElement, t: number): boolean {
  const x = exitWindow(el);
  return !!x && t >= x.end;
}
