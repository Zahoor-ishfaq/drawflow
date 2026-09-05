// SVG import normalizer (spec §11): strips styling/metadata, converts shape
// primitives to <path>, and returns flat 'd' strings + the source viewBox.
// Limitation (MVP): transform attributes on groups/shapes are not flattened
// into path data; heavily transformed SVGs may import misaligned.

export interface NormalizedSvg {
  paths: string[];
  width: number;
  height: number;
}

const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SKIP_TAGS = new Set(['style', 'defs', 'metadata', 'title', 'desc', 'script', 'mask', 'clipPath']);

export function normalizeSvg(svgText: string): NormalizedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid SVG file.');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('No <svg> root element found.');

  let width = 100;
  let height = 100;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => isFinite(n))) {
      width = parts[2];
      height = parts[3];
    }
  } else {
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    if (isFinite(w) && w > 0) width = w;
    if (isFinite(h) && h > 0) height = h;
  }

  const paths: string[] = [];
  walk(svg, paths);
  if (paths.length === 0) throw new Error('No drawable paths found in this SVG.');
  return { paths, width, height };
}

function walk(node: Element, out: string[]): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (SHAPE_TAGS.has(tag)) {
      const d = toPathData(child, tag);
      if (d) out.push(d);
    } else {
      walk(child, out); // g, svg, symbol wrappers…
    }
  }
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
