// Offline photo → doodle. No AI, no network: the picture is turned into ink
// lines (XDoG — extended difference of Gaussians), the lines are thinned to
// one-pixel skeletons, and the skeletons are traced into pen strokes the hand
// can draw one after another.

export interface SketchOptions {
  /** working size, long side in px (speed vs. detail) */
  size?: number;
  /** 0.5 (coarse, bold lines) … 3 (fine detail) */
  detail?: number;
  /** 0 (few lines) … 1 (many lines) */
  lines?: number;
  /** drop strokes shorter than this many px */
  minStroke?: number;
}

export interface SketchResult {
  paths: string[];   // one 'd' per stroke, in a width×height space
  width: number;
  height: number;
  strokeCount: number;
  totalLength: number;
}

const DEFAULTS: Required<SketchOptions> = { size: 720, detail: 1.0, lines: 0.4, minStroke: 12 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the picture.'));
    img.src = src;
  });
}

/** Separable Gaussian blur on a float image. */
function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        acc += src[y * w + xx] * k[i + r];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        acc += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Stretch the 2nd–98th percentile of intensities to 0..1. */
function stretchContrast(gray: Float32Array): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.min(255, Math.max(0, Math.round(gray[i] * 255)))]++;
  const n = gray.length;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  const a = lo / 255, b = Math.max(hi / 255, a + 0.05);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.min(1, Math.max(0, (gray[i] - a) / (b - a)));
}

/** 3×3 dilate then erode: bridges one-pixel breaks in lines. */
function closeGaps(ink: Uint8Array, w: number, h: number): void {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && ink[ny * w + nx]) { v = 1; break; }
    }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let dy = -1; dy <= 1 && v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !tmp[ny * w + nx]) { v = 0; break; }
    }
    ink[y * w + x] = v;
  }
}

/**
 * Edge ink map → binary (1 = ink). A difference of Gaussians picks out edges
 * (dark side negative); only the edge response is thresholded, so flat dark
 * areas stay white and the result is a line drawing, not a silhouette.
 */
function xdog(gray: Float32Array, w: number, h: number, detail: number, lines: number): Uint8Array {
  const sigma = 1.4 / Math.max(0.35, detail);   // finer detail = smaller blur
  const k = 1.6;
  const p = 24;                                  // edge amplification
  const thr = 0.5 - lines * 0.32;                // more lines = weaker edges count
  const g1 = blur(gray, w, h, sigma);
  const g2 = blur(gray, w, h, sigma * k);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const d = p * (g1[i] - g2[i]);
    out[i] = d < -thr ? 1 : 0;
  }
  return out;
}

/** Remove specks: connected ink components with fewer than `min` pixels. */
function despeckle(ink: Uint8Array, w: number, h: number, min: number): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue;
    const comp: number[] = [];
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (comp.length < min) for (const p of comp) ink[p] = 0;
  }
}

/** Zhang–Suen thinning to one-pixel-wide skeletons. */
function thin(ink: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ink[y * w + x]);
  let changed = true;
  const del: number[] = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!ink[y * w + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          const c1 = pass === 0 ? p2 * p4 * p6 : p2 * p4 * p8;
          const c2 = pass === 0 ? p4 * p6 * p8 : p2 * p6 * p8;
          if (c1 !== 0 || c2 !== 0) continue;
          del.push(y * w + x);
        }
      }
      if (del.length) { changed = true; for (const p of del) ink[p] = 0; }
    }
  }
}

/**
 * Walk skeleton pixels into polylines. At a junction the walk continues along
 * the neighbour that best keeps its direction, so long lines stay whole and
 * side branches become their own (short) strokes.
 */
function trace(ink: Uint8Array, w: number, h: number): number[][] {
  const used = new Uint8Array(w * h);
  const xy = (p: number): [number, number] => { const x = p % w; return [x, (p - x) / w]; };
  const around = (p: number, radius: number): number[] => {
    const [x, y] = xy(p);
    const out: number[] = [];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (ink[q]) out.push(q);
    }
    return out;
  };
  const degree = new Uint8Array(w * h);
  for (let p = 0; p < ink.length; p++) if (ink[p]) degree[p] = around(p, 1).length;

  const strokes: number[][] = [];
  const walk = (start: number): number[] => {
    let cur = start;
    const line = [cur];
    used[cur] = 1;
    let dirX = 0, dirY = 0;
    for (let steps = 0; steps < 100000; steps++) {
      let cands = around(cur, 1).filter((q) => !used[q]);
      if (cands.length === 0) cands = around(cur, 2).filter((q) => !used[q]); // bridge a 1px gap
      if (cands.length === 0) break;
      let next = cands[0];
      if (cands.length > 1 && (dirX || dirY)) {
        const [cx, cy] = xy(cur);
        let best = -Infinity;
        for (const q of cands) {
          const [qx, qy] = xy(q);
          const dx = qx - cx, dy = qy - cy;
          const len = Math.hypot(dx, dy) || 1;
          const dot = (dx * dirX + dy * dirY) / len;
          if (dot > best) { best = dot; next = q; }
        }
      }
      const [cx, cy] = xy(cur);
      const [nx, ny] = xy(next);
      const len = Math.hypot(nx - cx, ny - cy) || 1;
      // smoothed direction
      dirX = dirX * 0.6 + ((nx - cx) / len) * 0.4;
      dirY = dirY * 0.6 + ((ny - cy) / len) * 0.4;
      cur = next;
      used[cur] = 1;
      line.push(cur);
    }
    return line;
  };

  // endpoints first (natural stroke starts), then junctions, then loops
  for (const pass of [1, 3, 2] as const) {
    for (let p = 0; p < ink.length; p++) {
      if (!ink[p] || used[p]) continue;
      if (pass === 1 && degree[p] !== 1) continue;
      if (pass === 3 && degree[p] < 3) continue;
      const line = walk(p);
      if (line.length > 1) strokes.push(line);
      else used[p] = 1;
    }
  }
  return strokes;
}

/** Ramer–Douglas–Peucker simplification. */
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  let maxD = 0, idx = 0;
  const len = Math.hypot(bx - ax, by - ay) || 1e-6;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

/** Smooth polyline → path with quadratic joins (looks hand-drawn, not jaggy). */
function toPath(pts: [number, number][]): string {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}l0.01 0`;
  if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0]} ${pts[i][1]} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += `L${last[0]} ${last[1]}`;
  return d;
}

export async function sketchFromImage(src: string, opts: SketchOptions = {}): Promise<SketchResult> {
  const o = { ...DEFAULTS, ...opts };
  const img = await loadImage(src);
  const scale = Math.min(1, o.size / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('No 2D canvas');
  g.drawImage(img, 0, 0, w, h);
  const { data } = g.getImageData(0, 0, w, h);

  // grayscale 0..1, composited over white
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    const r = data[i] * a + 255 * (1 - a), gg = data[i + 1] * a + 255 * (1 - a), b = data[i + 2] * a + 255 * (1 - a);
    gray[p] = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
  }

  stretchContrast(gray);
  const ink = xdog(gray, w, h, o.detail, o.lines);
  closeGaps(ink, w, h);
  despeckle(ink, w, h, Math.max(6, Math.round(o.minStroke * 1.5)));
  thin(ink, w, h);
  const raw = trace(ink, w, h);

  let total = 0;
  const strokes = raw
    .map((line) => simplify(line.map((p) => [p % w, Math.floor(p / w)] as [number, number]), 0.9))
    .filter((pts) => {
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len < o.minStroke) return false;
      total += len;
      return true;
    });

  // draw order: greedy nearest-neighbour from the top-left, so the hand
  // doesn't leap around the page
  const ordered: [number, number][][] = [];
  const pool = strokes.slice();
  let cx = 0, cy = 0;
  while (pool.length) {
    let best = 0, bestD = Infinity, flip = false;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      const d0 = Math.hypot(s[0][0] - cx, s[0][1] - cy);
      const d1 = Math.hypot(s[s.length - 1][0] - cx, s[s.length - 1][1] - cy);
      if (d0 < bestD) { bestD = d0; best = i; flip = false; }
      if (d1 < bestD) { bestD = d1; best = i; flip = true; }
    }
    const s = pool.splice(best, 1)[0];
    const seq = flip ? s.slice().reverse() : s;
    ordered.push(seq);
    const end = seq[seq.length - 1];
    cx = end[0]; cy = end[1];
  }

  return { paths: ordered.map(toPath), width: w, height: h, strokeCount: ordered.length, totalLength: total };
}
