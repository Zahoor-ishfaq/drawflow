// Open Peeps ships as parts (heads, faces, facial hair, glasses, torsos,
// standing poses). We assemble ready-made people from them: busts, torsos
// with a head, and full standing figures. Faces are centred on the head's
// skin area; necks are found by rasterising the skin layer (bodies have the
// neck at the top edge, heads at the bottom).
import fs from 'node:fs';
import path from 'node:path';

const words = (s) => s.toLowerCase().replace(/[_\-./]+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

/** inner markup + viewBox of an atom */
function atom(file) {
  const text = fs.readFileSync(file, 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(text)[1].split(/[\s,]+/).map(Number);
  const inner = text.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>|<!--[\s\S]*?-->/g, '');
  return { vb, inner, name: path.basename(file, '.svg') };
}

const r = (n) => Math.round(n * 1000) / 1000;

const wrap = (vb, parts) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">${parts.map(([a, t]) => `<g transform="${t}">${a.inner}</g>`).join('')}</svg>`;


export async function composePeeps({ srcDir, outDir, normalize, listFiles, page }) {
  const root = listFiles(srcDir, (p) => p.endsWith('/assets/atoms/head/Afro.svg'))[0];
  if (!root) throw new Error('Open Peeps atoms not found');
  const atoms = path.dirname(path.dirname(root));
  const load = (dir, pred = () => true) => fs.readdirSync(path.join(atoms, dir)).filter((n) => n.endsWith('.svg') && !n.startsWith('*') && pred(n)).sort().map((n) => atom(path.join(atoms, dir, n)));
  const heads = load('head');
  const faces = load('face', (n) => !/Cyclops|Monster|Blank/.test(n));
  const hairs = load('facial-hair');
  const glasses = load('accessories', (n) => /Glasses/.test(n));
  const torsos = load('body');
  const standing = load('pose/standing');

  // neck of a body (top edge) / head (bottom edge) from the skin layer
  const neck = (a, edge) => page.evaluate(async ({ inner, vb, edge }) => {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">${inner}</svg>`, 'image/svg+xml');
    for (const g of Array.from(doc.querySelectorAll('[id]'))) if ((g.getAttribute('id') || '').includes('Ink')) g.remove();
    const text = new XMLSerializer().serializeToString(doc);
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
    await img.decode();
    const W = 300, H = Math.round((W * vb[3]) / vb[2]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const runsAt = (y) => { const runs = []; let s = -1; for (let x = 0; x <= W; x++) { const on = x < W && d[(y * W + x) * 4 + 3] > 60; if (on && s < 0) s = x; if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; } } return runs; };
    const scale = vb[2] / W;
    let y0;
    if (edge === 'top') y0 = 1;
    else { y0 = H - 1; while (y0 > 0 && runsAt(y0).length === 0) y0--; y0 = Math.max(0, y0 - 2); }
    const ys = edge === 'top' ? [y0, y0 + 2, y0 + 4] : [y0, y0 - 2, y0 - 4];
    const cands = runsAt(ys[0]).map(([a, b]) => ({ a, b, w: (b - a + 1) * scale, x: ((a + b) / 2) * scale }));
    const stable = cands.filter((rn) => ys.slice(1).every((y) => runsAt(y).some(([a, b]) => a <= rn.a + 8 && b >= rn.b - 8)));
    const pick = (stable.length ? stable : cands).filter((rn) => rn.w > 40 && rn.w < 260).sort((p, q) => Math.abs(p.x - vb[2] / 2) - Math.abs(q.x - vb[2] / 2))[0];
    return pick ? { x: pick.x, y: y0 * scale, w: pick.w } : null;
  }, { inner: a.inner, vb: a.vb, edge });

  const headNecks = new Map();
  for (const h of heads) headNecks.set(h.name, await neck(h, 'bottom'));

  const out = [];
  let n = 0;
  const emit = async (svgText, name, tags) => {
    const clean = await normalize(svgText, { trim: true });
    if (!clean) return;
    const id = `peep-${String(++n).padStart(3, '0')}`;
    fs.writeFileSync(path.join(outDir, `${id}.svg`), clean);
    out.push({ id: `op-${id}`, name, category: 'Sketch people', tags: uniq([...tags.flatMap(words), 'person', 'people', 'sketch', 'hand drawn', 'open peeps']), src: `/library/openpeeps/${id}.svg` });
  };

  // bounding boxes of an atom's layers (skin = Background, ink = Ink)
  const boxes = (a) => page.evaluate(({ inner, vb }) => {
    const host = document.createElement('div');
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">${inner}</svg>`;
    document.body.appendChild(host);
    const svg = host.firstElementChild;
    const bb = (sel) => { const el = Array.from(svg.querySelectorAll('[id]')).find((g) => (g.getAttribute('id') || '').includes(sel)); if (!el) return null; const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const out = { skin: bb('Background'), ink: bb('Ink') };
    host.remove();
    return out;
  }, { inner: a.inner, vb: a.vb });
  const skinOf = new Map();
  for (const h of heads) skinOf.set(h.name, (await boxes(h)).skin);
  const inkOf = new Map();
  for (const a of [...faces, ...hairs, ...glasses]) inkOf.set(a, (await boxes(a)).ink);

  // a head with a face (and sometimes beard / glasses), in head coordinates:
  // each part's ink is scaled to a share of the skin width and centred on a
  // point down the face
  const headParts = (head, face, hair, glass) => {
    const skin = skinOf.get(head.name) ?? { x: 60, y: 90, w: 350, h: 400 };
    const place = (a, share, down) => {
      const ink = inkOf.get(a);
      if (!ink) return null;
      const s = (skin.w * share) / ink.w;
      const cx = skin.x + skin.w / 2, cy = skin.y + skin.h * down;
      return `translate(${r(cx - (ink.x + ink.w / 2) * s)} ${r(cy - (ink.y + ink.h / 2) * s)}) scale(${r(s)})`;
    };
    const parts = [[head, 'translate(0 0)']];
    const f = place(face, 0.58, 0.46); if (f) parts.push([face, f]);
    if (hair) { const t = place(hair, 0.62, 0.78); if (t) parts.push([hair, t]); }
    if (glass) { const t = place(glass, 0.66, 0.40); if (t) parts.push([glass, t]); }
    return parts;
  };
  const pickHead = (i) => heads[i % heads.length];
  const pickFace = (i) => faces[(i * 7) % faces.length];

  // 1. busts
  for (let i = 0; i < 36; i++) {
    const head = pickHead(i), face = pickFace(i);
    const hair = i % 4 === 1 ? hairs[((i / 4) | 0) % hairs.length] : null;
    const glass = i % 5 === 2 ? glasses[((i / 5) | 0) % glasses.length] : null;
    const svg = wrap([0, 0, head.vb[2], head.vb[3]], headParts(head, face, hair, glass));
    await emit(svg, `${face.name} face, ${head.name.toLowerCase()} hair`, ['bust', 'head', 'face', 'portrait', 'avatar', face.name, head.name, hair ? 'beard' : '', glass ? 'glasses' : '']);
  }

  // 2. torsos with a head
  let k = 0;
  for (const body of torsos) {
    const nb = await neck(body, 'top');
    if (!nb) continue;
    const head = pickHead(k + 3), face = pickFace(k + 5);
    const nh = headNecks.get(head.name);
    if (!nh) { k++; continue; }
    const s = (nb.w * 0.95) / nh.w;
    const tx = nb.x - nh.x * s, ty = nb.y + 18 - nh.y * s;
    const vb = [Math.min(0, tx), Math.min(0, ty), 0, 0];
    vb[2] = Math.max(body.vb[2], tx + head.vb[2] * s) - vb[0];
    vb[3] = body.vb[3] - vb[1];
    const parts = headParts(head, face, k % 3 === 0 ? hairs[k % hairs.length] : null, k % 4 === 1 ? glasses[k % glasses.length] : null)
      .map(([a, t]) => [a, `translate(${r(tx)} ${r(ty)}) scale(${r(s)}) ${t}`]);
    await emit(wrap(vb, [[body, 'translate(0 0)'], ...parts]), `Person ${body.name.toLowerCase()}`, ['torso', 'upper body', body.name, face.name]);
    k++;
  }

  // 3. standing figures (the frame puts the neck at (748, 0), about 170 wide)
  for (let i = 0; i < standing.length; i++) {
    const body = standing[i];
    const nb = (await neck(body, 'top')) ?? { x: 748, y: 0, w: 170 };
    const head = pickHead(i * 5 + 1), face = pickFace(i + 2);
    const nh = headNecks.get(head.name);
    if (!nh) continue;
    const s = (nb.w * 1.0) / nh.w;
    const tx = nb.x - nh.x * s, ty = nb.y + 22 - nh.y * s;
    const vb = [Math.min(0, tx), Math.min(0, ty), 0, 0];
    vb[2] = Math.max(body.vb[2], tx + head.vb[2] * s) - vb[0];
    vb[3] = body.vb[3] - vb[1];
    const parts = headParts(head, face, i % 3 === 2 ? hairs[i % hairs.length] : null, i % 4 === 3 ? glasses[i % glasses.length] : null)
      .map(([a, t]) => [a, `translate(${r(tx)} ${r(ty)}) scale(${r(s)}) ${t}`]);
    const pose = body.name.replace(/-\d+$/, '').replace(/_/g, ' ');
    await emit(wrap(vb, [[body, 'translate(0 0)'], ...parts]), `Person ${pose}`, ['standing', 'full body', pose, face.name]);
  }
  return out;
}
