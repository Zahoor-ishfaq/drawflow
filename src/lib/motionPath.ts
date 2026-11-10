// Motion paths: an element travels along a route through a few points (a bird
// flying across the board, an arrow following a road). Pure math, no DOM — the
// render workers have no document to measure SVG paths with, and preview and
// export must agree frame for frame.

import type { Direction, MotionEasing, MotionPath, MotionPoint } from '../types';

const SAMPLES_PER_SEGMENT = 24;
const MAX_POINTS = 100;
const EASINGS = new Set<MotionEasing>(['easeOut', 'easeIn', 'easeInOut', 'linear']);
const FACINGS = new Set<Direction>(['right', 'left', 'top', 'bottom']);

export interface PathTable {
  pts: MotionPoint[];
  /** distance along the route at each sample */
  cum: number[];
  total: number;
}

/** Where the element is along its route: offset from the first point, and the heading in degrees. */
export interface PathPose { x: number; y: number; angle: number }

/** Uniform Catmull-Rom spline through the points (end points repeated), sampled into a polyline. */
function sample(points: MotionPoint[], smooth: boolean): MotionPoint[] {
  if (points.length < 2 || !smooth) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: MotionPoint[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

const tables = new Map<string, PathTable>();

/** The route sampled and measured, cached per point list. */
export function pathTable(points: MotionPoint[], smooth = true): PathTable {
  const key = `${smooth ? 's' : 'l'}${points.map((p) => `${p.x},${p.y}`).join(';')}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const pts = sample(points, smooth);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const table = { pts, cum, total: cum[cum.length - 1] ?? 0 };
  if (tables.size > 200) tables.clear();
  tables.set(key, table);
  return table;
}

/** Heading of the route around sample i, in degrees (0 = towards +x, 90 = down). */
function headingAt(t: PathTable, i: number): number {
  const n = t.pts.length;
  let a = Math.max(0, Math.min(i, n - 2)), b = a + 1;
  // skip zero-length steps (repeated points) so the heading is defined
  while (b < n - 1 && t.cum[b] - t.cum[a] < 1e-6) b++;
  while (a > 0 && t.cum[b] - t.cum[a] < 1e-6) a--;
  const dx = t.pts[b].x - t.pts[a].x, dy = t.pts[b].y - t.pts[a].y;
  return dx === 0 && dy === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Position (relative to the first point) and heading at fraction f (0..1) of the route's length. */
export function poseAt(t: PathTable, f: number): PathPose {
  const n = t.pts.length;
  if (n === 0) return { x: 0, y: 0, angle: 0 };
  if (n === 1 || t.total <= 0) return { x: 0, y: 0, angle: 0 };
  const d = Math.min(Math.max(f, 0), 1) * t.total;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid] <= d) lo = mid; else hi = mid;
  }
  const seg = t.cum[hi] - t.cum[lo];
  const u = seg > 0 ? (d - t.cum[lo]) / seg : 0;
  const x = t.pts[lo].x + (t.pts[hi].x - t.pts[lo].x) * u;
  const y = t.pts[lo].y + (t.pts[hi].y - t.pts[lo].y) * u;
  return { x: x - t.pts[0].x, y: y - t.pts[0].y, angle: headingAt(t, lo) };
}

/** Smallest signed difference between two headings, in degrees (-180..180). */
export function turnBetween(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** SVG path data for drawing the route on the board (points already in canvas units). */
export function routeD(points: MotionPoint[], smooth = true): string {
  const pts = sample(points, smooth);
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A motion path from untrusted data (a file, the API, an AI tool), or null when it is unusable. */
export function cleanMotion(raw: unknown): MotionPath | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m.points)) return null;
  const points = (m.points as unknown[])
    .map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : (p as Record<string, unknown>)))
    .filter((p): p is MotionPoint => !!p && finite(p.x) && finite(p.y))
    .slice(0, MAX_POINTS)
    .map((p) => ({ x: p.x, y: p.y }));
  if (points.length < 2) return null;
  const clamp = (v: unknown, d: number, lo: number, hi: number) => (finite(v) ? Math.min(Math.max(v, lo), hi) : d);
  const out: MotionPath = {
    points,
    duration: clamp(m.duration, 3, 0.1, 600),
    delay: clamp(m.delay, 0, 0, 600),
  };
  if (m.smooth === false) out.smooth = false;
  if (EASINGS.has(m.easing as MotionEasing)) out.easing = m.easing as MotionEasing;
  if (m.orient === true) out.orient = true;
  if (FACINGS.has(m.facing as Direction) && m.facing !== 'right') out.facing = m.facing as Direction;
  return out;
}
