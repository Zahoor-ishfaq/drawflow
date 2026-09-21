// Runs inside a browser page (Playwright): turns an arbitrary SVG into the
// subset DrawFlow's importer understands — plain shapes with baked fill /
// stroke colours (opacity folded into rgba), no CSS classes, no gradients,
// no <use>, no masks, no text — and optionally drops a full-bleed background
// and a watermark band. Returns the cleaned SVG text or null when nothing
// drawable is left.
export function normalizeInPage({ svg: svgText, opts }) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const svg = document.importNode(doc.documentElement, true);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:1000px;height:1000px;overflow:hidden;opacity:0.01';
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    // viewBox
    let vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((n) => !isFinite(n))) {
      const w = parseFloat(svg.getAttribute('width')) || 100;
      const h = parseFloat(svg.getAttribute('height')) || 100;
      vb = [0, 0, w, h];
      svg.setAttribute('viewBox', vb.join(' '));
    }
    svg.setAttribute('width', String(vb[2]));
    svg.setAttribute('height', String(vb[3]));
    const area = vb[2] * vb[3];

    // expand <use> so the referenced shapes become real children
    for (const use of Array.from(svg.querySelectorAll('use'))) {
      const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      const target = href.startsWith('#') ? svg.querySelector(href) : null;
      if (!target) { use.remove(); continue; }
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const x = parseFloat(use.getAttribute('x')) || 0, y = parseFloat(use.getAttribute('y')) || 0;
      const t = [use.getAttribute('transform'), x || y ? `translate(${x} ${y})` : ''].filter(Boolean).join(' ');
      if (t) g.setAttribute('transform', t);
      for (const a of ['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'style', 'class']) {
        if (use.hasAttribute(a)) g.setAttribute(a, use.getAttribute(a));
      }
      g.appendChild(target.cloneNode(true));
      use.replaceWith(g);
    }

    // gradients → one representative colour (mean of the stops)
    const gradientColour = (id) => {
      const grad = svg.querySelector(`#${CSS.escape(id)}`);
      if (!grad) return null;
      let stops = Array.from(grad.querySelectorAll('stop'));
      const ref = grad.getAttribute('href') || grad.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!stops.length && ref && ref.startsWith('#')) stops = Array.from((svg.querySelector(ref) || grad).querySelectorAll('stop'));
      if (!stops.length) return null;
      let r = 0, g = 0, b = 0, a = 0;
      for (const s of stops) {
        const cs = getComputedStyle(s);
        const c = parseColour(cs.stopColor);
        const so = parseFloat(cs.stopOpacity);
        r += c[0]; g += c[1]; b += c[2]; a += (isFinite(so) ? so : 1) * c[3];
      }
      const n = stops.length;
      return [r / n, g / n, b / n, a / n];
    };
    const parseColour = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      if (!m) return [0, 0, 0, s === 'none' || s === 'transparent' ? 0 : 1];
      const p = m[1].split(',').map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const css = (c) => {
      const [r, g, b, a] = c;
      const hex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
      return a >= 0.995 ? `#${hex(r)}${hex(g)}${hex(b)}` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`;
    };

    const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
    const DROP = new Set(['text', 'tspan', 'image', 'foreignObject', 'title', 'desc', 'metadata', 'script', 'filter', 'symbol', 'pattern', 'marker']);
    const inheritedAlpha = (el) => {
      let a = 1;
      for (let n = el; n && n !== svg; n = n.parentElement) {
        const o = parseFloat(getComputedStyle(n).opacity);
        if (isFinite(o)) a *= o;
      }
      return a;
    };

    // bake styles into attributes on every shape; remember bboxes
    const shapes = [];
    for (const el of Array.from(svg.querySelectorAll('*'))) {
      const tag = el.localName;
      if (DROP.has(tag)) { el.remove(); continue; }
      if (el.closest('defs, mask, clipPath, linearGradient, radialGradient')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') { el.remove(); continue; }
      if (!SHAPES.has(tag)) continue;
      const alpha = inheritedAlpha(el);
      const paint = (prop, opProp) => {
        let c;
        const raw = cs[prop];
        if (raw && raw.startsWith('url(')) {
          const id = /url\(["']?#([^"')]+)/.exec(raw)?.[1];
          c = id ? gradientColour(id) : null;
          if (!c) c = [128, 128, 128, 1];
        } else c = parseColour(raw);
        const op = parseFloat(cs[opProp]);
        c = [c[0], c[1], c[2], c[3] * (isFinite(op) ? op : 1) * alpha];
        return c[3] <= 0.004 ? 'none' : css(c);
      };
      const fill = paint('fill', 'fillOpacity');
      const stroke = paint('stroke', 'strokeOpacity');
      const sw = parseFloat(cs.strokeWidth);
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', stroke);
      if (stroke !== 'none' && isFinite(sw)) el.setAttribute('stroke-width', String(Math.round(sw * 100) / 100));
      if (cs.fillRule === 'evenodd') el.setAttribute('fill-rule', 'evenodd'); else el.removeAttribute('fill-rule');
      if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') el.setAttribute('stroke-linecap', cs.strokeLinecap);
      if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') el.setAttribute('stroke-linejoin', cs.strokeLinejoin);
      for (const a of ['class', 'style', 'id', 'opacity', 'fill-opacity', 'stroke-opacity', 'clip-path', 'mask', 'filter', 'clip-rule', 'stroke-miterlimit']) el.removeAttribute(a);
      if (fill === 'none' && stroke === 'none') { el.remove(); continue; }
      let bb = null;
      try { bb = el.getBBox(); } catch { /* ignore */ }
      shapes.push({ el, bb, fill, stroke });
    }

    // full-bleed background: a shape covering most of the canvas, sitting under everything
    if (opts.stripBackground) {
      // a plain rect / circle (or a canvas-sized path) among the first shapes
      for (const s of shapes.slice(0, 6)) {
        if (!s.bb || !s.el.isConnected) continue;
        const cover = (s.bb.width * s.bb.height) / area;
        const primitive = ['rect', 'circle', 'ellipse'].includes(s.el.localName);
        const canvasSized = s.bb.width >= vb[2] * 0.9 && s.bb.height >= vb[3] * 0.9;
        if (cover >= 0.6 && (primitive || canvasSized)) s.el.remove();
      }
    }
    // watermark band: small things hugging the bottom edge
    if (opts.stripBottomBand) {
      const bandTop = vb[1] + vb[3] * (1 - opts.stripBottomBand);
      for (const s of shapes) {
        if (!s.bb || !s.el.isConnected) continue;
        if (s.bb.y >= bandTop && s.bb.height < vb[3] * 0.06) s.el.remove();
      }
    }

    // strip attributes / containers the importer ignores, and empty groups
    for (const el of Array.from(svg.querySelectorAll('defs, style, mask, clipPath, linearGradient, radialGradient'))) el.remove();
    for (const el of Array.from(svg.querySelectorAll('*'))) {
      for (const a of ['class', 'style', 'id', 'opacity', 'fill-opacity', 'stroke-opacity', 'clip-path', 'mask', 'filter', 'data-name', 'xml:space', 'enable-background']) el.removeAttribute(a);
      if (el.localName === 'g' || el.localName === 'svg') { el.removeAttribute('fill'); el.removeAttribute('stroke'); }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of Array.from(svg.querySelectorAll('g, a, switch'))) {
        if (g.children.length === 0) { g.remove(); changed = true; }
      }
    }
    for (const a of Array.from(svg.attributes)) {
      if (!['viewBox', 'width', 'height', 'xmlns'].includes(a.name)) svg.removeAttribute(a.name);
    }
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!svg.querySelector('path, rect, circle, ellipse, line, polyline, polygon')) return null;

    // trim: tighten the viewBox around the remaining ink (with a small margin)
    if (opts.trim) {
      let bb = null;
      try { bb = svg.getBBox(); } catch { /* ignore */ }
      if (bb && bb.width > 0 && bb.height > 0) {
        const m = Math.max(bb.width, bb.height) * 0.03;
        svg.setAttribute('viewBox', `${r3(bb.x - m)} ${r3(bb.y - m)} ${r3(bb.width + 2 * m)} ${r3(bb.height + 2 * m)}`);
        svg.setAttribute('width', String(r3(bb.width + 2 * m)));
        svg.setAttribute('height', String(r3(bb.height + 2 * m)));
      }
    }
    return new XMLSerializer().serializeToString(svg).replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><');
  } finally {
    host.remove();
  }
  function r3(n) { return Math.round(n * 1000) / 1000; }
}
