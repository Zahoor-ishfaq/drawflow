// Where an element sits on the timeline, derived from its own settings.
// Slot = draw → emphasis → pause; the next element starts after the slot.
// An exit runs `exit.delay` seconds after the slot ends and may overlap
// later elements — it only extends the project length, never the chain.

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

/** Last moment the element affects the picture. */
export function elementEnd(el: DrawElement): number {
  const x = exitWindow(el);
  return x ? Math.max(slotEnd(el), x.end) : slotEnd(el);
}

/** True once the exit has completely finished (element is gone). */
export function hasExited(el: DrawElement, t: number): boolean {
  const x = exitWindow(el);
  return !!x && t >= x.end;
}
