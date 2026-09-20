// Canvas2D twin of svgStringForTime: paints one frame straight onto a
// (Offscreen)Canvas from the same ElementFrame math, with no SVG parsing or
// <img> decoding in the loop. Runs on the main thread or inside a render
// worker (nothing here touches the DOM). Path2D objects are cached per path.

import type { DrawElement, PaperStyle, Project } from '../types';
import { cuffPath, sleevePath, type HandDef } from '../assets/hands';
import { localBounds } from './camera';
import { scribbleStrokeWidth } from './scribble';
import {
  elementFrameAt, elementTransform, pathColors, type ElementFrame, type Rect,
} from './renderFrame';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Everything a frame needs besides time: bitmaps and hand geometry. */
export interface CanvasAssets {
  images: Map<string, ImageBitmap>;          // element id → decoded picture
  hands: Map<string, { def: HandDef; bitmap: ImageBitmap }>;
}

/** Hand pose for one frame (plain data: computed on the main thread). */
export interface HandPose {
  defId: string;
  x: number;
  y: number;
  scale: number;
  offset: { x: number; y: number };
}

export interface FrameSpec {
  t: number;
  view: Rect;                                // camera viewBox
  hand: HandPose | null;
  paper: { paper: PaperStyle; background: string };
  overlay: { kind: 'fade' | 'wipe'; amount: number; color?: string } | null;
  /** elements to draw, in stacking order (already filtered for scenes / hidden) */
  elementIds: string[];
}

const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    if (pathCache.size > 4000) pathCache.clear();
    pathCache.set(d, p);
  }
  return p;
}

const LINE = 'rgba(70, 110, 160, 0.16)';

/** Paper background in canvas coordinates (patterns anchored at the origin, like the SVG). */
function drawPaper(ctx: Ctx2D, paper: PaperStyle, color: string, vb: Rect): void {
  ctx.fillStyle = color;
  ctx.fillRect(vb.x, vb.y, vb.width, vb.height);
  if (paper === 'grid') {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = Math.floor(vb.x / 80) * 80; x <= vb.x + vb.width; x += 80) { ctx.moveTo(x, vb.y); ctx.lineTo(x, vb.y + vb.height); }
    for (let y = Math.floor(vb.y / 80) * 80; y <= vb.y + vb.height; y += 80) { ctx.moveTo(vb.x, y); ctx.lineTo(vb.x + vb.width, y); }
    ctx.stroke();
  } else if (paper === 'dots') {
    ctx.fillStyle = 'rgba(70,90,120,0.22)';
    for (let x = Math.floor(vb.x / 60) * 60 + 30; x <= vb.x + vb.width; x += 60) {
      for (let y = Math.floor(vb.y / 60) * 60 + 30; y <= vb.y + vb.height; y += 60) {
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (paper === 'lined') {
    ctx.strokeStyle = 'rgba(90,140,200,0.28)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let y = Math.floor(vb.y / 90) * 90 + 89.5; y <= vb.y + vb.height; y += 90) { ctx.moveTo(vb.x, y); ctx.lineTo(vb.x + vb.width, y); }
    ctx.stroke();
  }
}

/** Apply "translate rotate scale" like elementTransform, plus flips. */
function applyElementTransform(ctx: Ctx2D, el: DrawElement, frame: ElementFrame): void {
  ctx.translate(el.x + frame.dx, el.y + frame.dy);
  ctx.rotate(((el.rotation + frame.rotate) * Math.PI) / 180);
  ctx.scale(el.scale * frame.scale * (el.flipX ? -1 : 1), el.scale * frame.scale * (el.flipY ? -1 : 1));
}

function setDash(ctx: Ctx2D, dash: { strokeDasharray: string; strokeDashoffset: number } | undefined): void {
  if (!dash || dash.strokeDasharray === 'none') { ctx.setLineDash([]); ctx.lineDashOffset = 0; return; }
  const len = parseFloat(dash.strokeDasharray);
  ctx.setLineDash([len, len]);
  ctx.lineDashOffset = dash.strokeDashoffset;
}

/** Vector artwork (paths) in local coordinates. */
function drawPaths(ctx: Ctx2D, el: DrawElement, frame: ElementFrame, alpha: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = el.strokeWidth / el.scale;
  el.paths.forEach((d, i) => {
    if (frame.visibleCount !== null && i >= frame.visibleCount) return;
    const p = path2d(d);
    const { fill, stroke } = pathColors(el, i);
    if (fill !== 'none' && frame.fillOpacity > 0) {
      ctx.globalAlpha = alpha * frame.fillOpacity;
      ctx.fillStyle = fill;
      ctx.fill(p, el.fillRule ?? 'nonzero');
    }
    if (stroke !== 'none' && ctx.lineWidth > 0) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke;
      setDash(ctx, frame.dashes?.[i]);
      ctx.stroke(p);
    }
  });
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Raster picture with crop + reveal mask, in local (image px) coordinates. */
function drawImage(
  ctx: Ctx2D, el: DrawElement, frame: ElementFrame, bitmap: ImageBitmap, scratch: OffscreenCanvas,
): void {
  if (!el.image) return;
  const w = el.image.width, h = el.image.height;
  const masked = !!(frame.dashes || frame.revealMask);
  const c = el.crop;
  const cropRect = c && (c.left || c.top || c.right || c.bottom)
    ? { x: w * c.left, y: h * c.top, width: w * (1 - c.left - c.right), height: h * (1 - c.top - c.bottom) }
    : null;

  if (!masked) {
    ctx.save();
    if (cropRect) { ctx.beginPath(); ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height); ctx.clip(); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    ctx.restore();
    return;
  }

  // masked reveal: paint into a scratch layer in image pixels, keep only the mask
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const s = scratch.getContext('2d')!;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, w, h);
  s.save();
  if (cropRect) { s.beginPath(); s.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height); s.clip(); }
  s.drawImage(bitmap, 0, 0, w, h);
  s.restore();
  s.globalCompositeOperation = 'destination-in';
  s.fillStyle = '#fff';
  s.strokeStyle = '#fff';
  if (frame.revealMask) {
    // the SVG mask markup is one rect or one circle: read its numbers back
    const rect = /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/.exec(frame.revealMask);
    const circle = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/.exec(frame.revealMask);
    s.beginPath();
    if (rect) s.rect(+rect[1], +rect[2], +rect[3], +rect[4]);
    else if (circle) s.arc(+circle[1], +circle[2], +circle[3], 0, Math.PI * 2);
    s.fill();
  } else if (frame.dashes) {
    s.lineCap = 'round';
    s.lineWidth = scribbleStrokeWidth(w, h);
    el.paths.forEach((d, i) => {
      setDash(s, frame.dashes![i]);
      s.stroke(path2d(d));
    });
    s.setLineDash([]);
  }
  s.globalCompositeOperation = 'source-over';
  ctx.drawImage(scratch, 0, 0);
}

function drawHand(ctx: Ctx2D, pose: HandPose, assets: CanvasAssets): void {
  const hand = assets.hands.get(pose.defId);
  if (!hand) return;
  const { def, bitmap } = hand;
  ctx.save();
  const ox = pose.offset.x * def.height, oy = pose.offset.y * def.height;
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-def.tipX + ox, -def.tipY + oy);
  if (def.mirror) { ctx.translate(def.width, 0); ctx.scale(-1, 1); }
  const s = def.sleeve;
  if (s) {
    const hw2 = s.hw1 * 1.15;
    // sleeve shadow (offset like the hand's baked shadow)
    ctx.save();
    ctx.translate(14 + s.x, 16 + s.y);
    ctx.rotate((s.angle * Math.PI) / 180);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#141820';
    try { (ctx as CanvasRenderingContext2D).filter = 'blur(11px)'; } catch { /* unsupported */ }
    ctx.fill(path2d(sleevePath(s)));
    ctx.restore();
    ctx.drawImage(bitmap, 0, 0, def.width, def.height);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((s.angle * Math.PI) / 180);
    const g = ctx.createLinearGradient(0, -hw2, 0, hw2);
    g.addColorStop(0, '#242935'); g.addColorStop(0.45, '#363d4d'); g.addColorStop(1, '#1f232c');
    ctx.fillStyle = g;
    ctx.fill(path2d(sleevePath(s)));
    ctx.fillStyle = '#3d4557';
    ctx.fill(path2d(cuffPath(s)));
    const hwC = s.hw0 + ((s.hw1 - s.hw0) * 48) / 260;
    ctx.strokeStyle = '#1c2029';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(48, -hwC); ctx.lineTo(48, hwC); ctx.stroke();
    ctx.restore();
  } else {
    ctx.drawImage(bitmap, 0, 0, def.width, def.height);
  }
  ctx.restore();
}

export interface CanvasPainter {
  paint(spec: FrameSpec): void;
}

/**
 * Painter bound to one canvas. `elements` is every element by id; the frame
 * spec says which to draw and where the camera is.
 */
export function createCanvasPainter(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  _project: Project,
  elements: Map<string, DrawElement>,
  assets: CanvasAssets,
  options: { willReadFrequently?: boolean } = {},
): CanvasPainter {
  // a CPU-backed canvas makes getImageData a memcpy instead of a GPU readback
  const ctx = canvas.getContext('2d', { willReadFrequently: !!options.willReadFrequently }) as Ctx2D | null;
  if (!ctx) throw new Error('Could not create a 2D canvas context.');
  const outW = canvas.width, outH = canvas.height;
  const scratch = new OffscreenCanvas(1, 1);   // image masks
  const layer = new OffscreenCanvas(outW, outH); // erase / clip layers
  const lctx = layer.getContext('2d')!;

  const paintElement = (target: Ctx2D, el: DrawElement, frame: ElementFrame, alpha: number) => {
    target.save();
    applyElementTransform(target, el, frame);
    const b = localBounds(el);
    if (frame.highlight > 0) {
      const pad = Math.max(b.width, b.height) * 0.08 + 6;
      target.globalAlpha = alpha * 0.55 * frame.highlight;
      target.fillStyle = '#ffe14d';
      target.beginPath();
      (target as CanvasRenderingContext2D).roundRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, pad);
      target.fill();
      target.globalAlpha = 1;
    }
    if (frame.clip) {
      target.beginPath();
      target.rect(frame.clip.x, frame.clip.y, Math.max(0, frame.clip.width), Math.max(0, frame.clip.height));
      target.clip();
    }
    if (el.kind === 'image' && el.image) {
      const bmp = assets.images.get(el.id);
      target.globalAlpha = alpha;
      if (bmp) drawImage(target, el, frame, bmp, scratch);
      target.globalAlpha = 1;
    } else {
      drawPaths(target, el, frame, alpha);
    }
    target.restore();
  };

  return {
    paint(spec) {
      const vb = spec.view;
      const scale = outW / vb.width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, outW, outH);
      ctx.setTransform(scale, 0, 0, scale, -vb.x * scale, -vb.y * scale);
      drawPaper(ctx, spec.paper.paper, spec.paper.background, vb);

      for (const id of spec.elementIds) {
        const el = elements.get(id);
        if (!el) continue;
        const frame = elementFrameAt(el, spec.t, vb);
        if (!frame) continue;
        if (frame.erase) {
          // paint the element on its own layer, rub the scribble out of it, composite
          lctx.setTransform(1, 0, 0, 1, 0, 0);
          lctx.globalCompositeOperation = 'source-over';
          lctx.clearRect(0, 0, outW, outH);
          lctx.setTransform(scale, 0, 0, scale, -vb.x * scale, -vb.y * scale);
          paintElement(lctx, el, frame, frame.groupOpacity);
          lctx.save();
          applyElementTransform(lctx, el, frame);
          lctx.globalCompositeOperation = 'destination-out';
          lctx.strokeStyle = '#000';
          lctx.lineCap = 'round';
          lctx.lineWidth = frame.erase.strokeWidth;
          setDash(lctx, frame.erase.dash);
          lctx.stroke(path2d(frame.erase.d));
          lctx.setLineDash([]);
          lctx.restore();
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(layer, 0, 0);
          ctx.restore();
        } else {
          paintElement(ctx, el, frame, frame.groupOpacity);
        }
      }

      if (spec.hand) drawHand(ctx, spec.hand, assets);

      if (spec.overlay && spec.overlay.amount > 0) {
        ctx.fillStyle = spec.overlay.color ?? spec.paper.background;
        if (spec.overlay.kind === 'fade') {
          ctx.globalAlpha = spec.overlay.amount;
          ctx.fillRect(vb.x, vb.y, vb.width, vb.height);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillRect(vb.x + vb.width * (spec.overlay.amount * 2 - 1), vb.y, vb.width, vb.height);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}

// keep the SVG helpers referenced so the two renderers stay in one import graph
export { elementTransform };
