// Minimal SVG path toolkit: parse 'd' strings, absolutize, turn arcs into
// cubics, and bake an affine transform into the coordinates. Used by the
// importer so nested <g transform> wrappers can be flattened into plain paths.

export type Matrix = [number, number, number, number, number, number]; // a b c d e f

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);
}

/** Parse an SVG `transform` attribute into a matrix. */
export function parseTransform(str: string | null | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(str))) {
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) t = args as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        t = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const [, cx, cy] = args;
          t = multiply(multiply([1, 0, 0, 1, cx, cy], t), [1, 0, 0, 1, -cx, -cy]);
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

// --- path parsing ---------------------------------------------------------

type Seg =
  | { c: 'M'; p: [number, number] }
  | { c: 'L'; p: [number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Q'; p: [number, number, number, number] }
  | { c: 'Z' };

const CMD_RE = /^[MmLlHhVvCcSsQqTtAaZz]$/;

/** Raw tokens (kept as strings so glued arc flags like "01" survive). */
function tokenize(d: string): string[] {
  const out: string[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : m[2]);
  return out;
}

/** Parse into absolute M/L/C/Q/Z segments (arcs → cubics). */
export function parsePath(d: string): Seg[] {
  const tokens = tokenize(d);
  const segs: Seg[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0, cy = 0;       // current point
  let sx = 0, sy = 0;       // subpath start
  let lastC: [number, number] | null = null; // last cubic control (for S)
  let lastQ: [number, number] | null = null; // last quad control (for T)

  const num = (): number => {
    const t = tokens[i++];
    return t === undefined || CMD_RE.test(t) ? NaN : parseFloat(t);
  };
  // an arc flag is exactly one character; anything glued after it is the next number
  const flag = (): number => {
    const t = tokens[i];
    if (t === undefined || CMD_RE.test(t)) { i++; return NaN; }
    if (t.length > 1 && (t[0] === '0' || t[0] === '1')) {
      tokens[i] = t.slice(1);
      return t[0] === '1' ? 1 : 0;
    }
    i++;
    return parseFloat(t);
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (CMD_RE.test(t)) { cmd = t; i++; }
    else if (!cmd) { i++; continue; }
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      segs.push({ c: 'Z' });
      cx = sx; cy = sy;
      lastC = lastQ = null;
      continue;
    }
    if (C === 'M') {
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      segs.push({ c: 'M', p: [x, y] });
      cx = sx = x; cy = sy = y;
      lastC = lastQ = null;
      continue;
    }
    if (C === 'L') {
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      segs.push({ c: 'L', p: [x, y] });
      cx = x; cy = y; lastC = lastQ = null;
      continue;
    }
    if (C === 'H') {
      let x = num();
      if (rel) x += cx;
      segs.push({ c: 'L', p: [x, cy] });
      cx = x; lastC = lastQ = null;
      continue;
    }
    if (C === 'V') {
      let y = num();
      if (rel) y += cy;
      segs.push({ c: 'L', p: [cx, y] });
      cy = y; lastC = lastQ = null;
      continue;
    }
    if (C === 'C' || C === 'S') {
      let x1: number, y1: number;
      if (C === 'C') {
        x1 = num(); y1 = num();
        if (rel) { x1 += cx; y1 += cy; }
      } else {
        x1 = lastC ? 2 * cx - lastC[0] : cx;
        y1 = lastC ? 2 * cy - lastC[1] : cy;
      }
      let x2 = num(), y2 = num(), x = num(), y = num();
      if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
      segs.push({ c: 'C', p: [x1, y1, x2, y2, x, y] });
      lastC = [x2, y2]; lastQ = null;
      cx = x; cy = y;
      continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1: number, y1: number;
      if (C === 'Q') {
        x1 = num(); y1 = num();
        if (rel) { x1 += cx; y1 += cy; }
      } else {
        x1 = lastQ ? 2 * cx - lastQ[0] : cx;
        y1 = lastQ ? 2 * cy - lastQ[1] : cy;
      }
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      segs.push({ c: 'Q', p: [x1, y1, x, y] });
      lastQ = [x1, y1]; lastC = null;
      cx = x; cy = y;
      continue;
    }
    if (C === 'A') {
      const rx = num(), ry = num(), rot = num();
      const large = flag(), sweep = flag();
      let x = num(), y = num();
      if (rel) { x += cx; y += cy; }
      if ([rx, ry, rot, large, sweep, x, y].some((v) => Number.isNaN(v))) break;
      for (const c of arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y)) segs.push({ c: 'C', p: c });
      cx = x; cy = y; lastC = lastQ = null;
      continue;
    }
    i++; // unknown → skip token
  }
  return segs;
}

function arcToCubics(
  x1: number, y1: number, rx: number, ry: number, angle: number,
  large: number, sweep: number, x2: number, y2: number,
): [number, number, number, number, number, number][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / (den || 1)));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / n;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: [number, number, number, number, number, number][] = [];
  let th = theta1;
  for (let k = 0; k < n; k++) {
    const cos1 = Math.cos(th), sin1 = Math.sin(th);
    const cos2 = Math.cos(th + delta), sin2 = Math.sin(th + delta);
    const p1 = [cos1 - t * sin1, sin1 + t * cos1];
    const p2 = [cos2 + t * sin2, sin2 - t * cos2];
    const p3 = [cos2, sin2];
    const map = (p: number[]): [number, number] => [
      cx + rx * p[0] * cosP - ry * p[1] * sinP,
      cy + rx * p[0] * sinP + ry * p[1] * cosP,
    ];
    const a = map(p1), b = map(p2), c = map(p3);
    out.push([a[0], a[1], b[0], b[1], c[0], c[1]]);
    th += delta;
  }
  return out;
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

export function serialize(segs: Seg[]): string {
  let out = '';
  for (const s of segs) {
    switch (s.c) {
      case 'M': out += `M${f(s.p[0])} ${f(s.p[1])}`; break;
      case 'L': out += `L${f(s.p[0])} ${f(s.p[1])}`; break;
      case 'C': out += `C${s.p.map(f).join(' ')}`; break;
      case 'Q': out += `Q${s.p.map(f).join(' ')}`; break;
      case 'Z': out += 'Z'; break;
    }
  }
  return out;
}

/** Bake an affine transform into path data. */
export function transformPath(d: string, m: Matrix): string {
  const segs = parsePath(d);
  if (isIdentity(m)) return serialize(segs);
  for (const s of segs) {
    if (s.c === 'Z') continue;
    for (let k = 0; k < s.p.length; k += 2) {
      const [x, y] = applyMatrix(m, s.p[k], s.p[k + 1]);
      s.p[k] = x;
      s.p[k + 1] = y;
    }
  }
  return serialize(segs);
}
