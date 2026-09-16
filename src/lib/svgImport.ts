// SVG import normalizer (spec §11): strips styling/metadata, converts shape
// primitives to <path>, flattens nested transforms into the path data, and
// keeps each path's fill/stroke colour so coloured artwork survives import.

import { multiply, parseTransform, transformPath, type Matrix, IDENTITY } from './svgPath';

export interface NormalizedSvg {
  paths: string[];
  /** per-path fill colour, or null → use the element default */
  fills: (string | null)[];
  /** per-path stroke colour, or null → use the element default */
  strokes: (string | null)[];
  width: number;
  height: number;
  /** true when the artwork is essentially single-colour line art */
  monochrome: boolean;
  /** any path relies on the even-odd rule for its holes */
  evenOdd: boolean;
}

const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SKIP_TAGS = new Set(['style', 'defs', 'metadata', 'title', 'desc', 'script', 'mask', 'clipPath', 'symbol', 'pattern', 'lineargradient', 'radialgradient']);

interface Style {
  fill: string | null;    // null = inherit/unspecified
  stroke: string | null;
  evenOdd: boolean;
}

export function normalizeSvg(svgText: string): NormalizedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid SVG file.');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('No <svg> root element found.');

  let width = 100;
  let height = 100;
  let origin: Matrix = IDENTITY;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => isFinite(n))) {
      width = parts[2];
      height = parts[3];
      // shift so the viewBox origin becomes (0,0)
      origin = [1, 0, 0, 1, -parts[0], -parts[1]];
    }
  } else {
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    if (isFinite(w) && w > 0) width = w;
    if (isFinite(h) && h > 0) height = h;
  }

  const out: NormalizedSvg = { paths: [], fills: [], strokes: [], width, height, monochrome: true, evenOdd: false };
  const inherited = readStyle(svg, { fill: null, stroke: null, evenOdd: false });
  walk(svg, origin, inherited, out);
  if (out.paths.length === 0) throw new Error('No drawable paths found in this SVG.');

  const colours = new Set<string>();
  out.fills.forEach((c) => c && c !== 'none' && colours.add(c.toLowerCase()));
  out.strokes.forEach((c) => c && c !== 'none' && colours.add(c.toLowerCase()));
  out.monochrome = colours.size <= 1;
  return out;
}

function walk(node: Element, m: Matrix, style: Style, out: NormalizedSvg): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (child.getAttribute('display') === 'none' || /display\s*:\s*none/.test(child.getAttribute('style') ?? '')) continue;
    const local = multiply(m, parseTransform(child.getAttribute('transform')));
    const st = readStyle(child, style);
    if (SHAPE_TAGS.has(tag)) {
      const d = toPathData(child, tag);
      if (!d) continue;
      let baked: string;
      try { baked = transformPath(d, local); } catch { continue; }
      if (!baked) continue;
      out.paths.push(baked);
      out.fills.push(st.fill);
      out.strokes.push(st.stroke);
      if (st.evenOdd) out.evenOdd = true;
    } else {
      walk(child, local, st, out); // g, svg, a, switch…
    }
  }
}

function readStyle(el: Element, parent: Style): Style {
  const styleAttr = el.getAttribute('style') ?? '';
  const fromStyle = (prop: string): string | null => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(styleAttr);
    return m ? m[1].trim() : null;
  };
  const norm = (v: string | null): string | null => {
    if (!v) return null;
    const t = v.trim();
    if (t === 'inherit' || t === '') return null;
    if (t === 'currentColor') return null; // → element default colour
    if (t.startsWith('url(')) return null; // gradients/patterns → default
    return t;
  };
  const fill = norm(fromStyle('fill') ?? el.getAttribute('fill'));
  const stroke = norm(fromStyle('stroke') ?? el.getAttribute('stroke'));
  const rule = (fromStyle('fill-rule') ?? el.getAttribute('fill-rule') ?? '').trim();
  const evenOdd = rule === 'evenodd' ? true : rule === 'nonzero' ? false : parent.evenOdd;
  return { fill: fill ?? parent.fill, stroke: stroke ?? parent.stroke, evenOdd };
}

function num(el: Element, attr: string, fallback = 0): number {
  const v = parseFloat(el.getAttribute(attr) ?? '');
  return isFinite(v) ? v : fallback;
}

function toPathData(el: Element, tag: string): string | null {
  switch (tag) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const x = num(el, 'x'), y = num(el, 'y');
      const w = num(el, 'width'), h = num(el, 'height');
      if (w <= 0 || h <= 0) return null;
      let rx = num(el, 'rx', NaN), ry = num(el, 'ry', NaN);
      if (isNaN(rx) && isNaN(ry)) { rx = 0; ry = 0; }
      else if (isNaN(rx)) rx = ry;
      else if (isNaN(ry)) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) {
        return `M${x} ${y}h${w}v${h}h${-w}Z`;
      }
      return (
        `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}` +
        `v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}` +
        `h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}` +
        `v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`
      );
    }
    case 'circle': {
      const cx = num(el, 'cx'), cy = num(el, 'cy'), r = num(el, 'r');
      if (r <= 0) return null;
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
    }
    case 'ellipse': {
      const cx = num(el, 'cx'), cy = num(el, 'cy');
      const rx = num(el, 'rx'), ry = num(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
    }
    case 'line':
      return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4 || pts.some((n) => !isFinite(n))) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pts.length - 1; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      if (tag === 'polygon') d += 'Z';
      return d;
    }
    default:
      return null;
  }
}
