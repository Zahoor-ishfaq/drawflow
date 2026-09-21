// Helpers that turn user gestures (add text / shape / import) into store
// elements. New elements flow left-to-right, top-to-bottom across the
// artboard so a scribe built by just clicking "add" already reads well.

import { sequenceOrder, useStore } from '../store/useStore';
import type { DrawElement, ImageRef } from '../types';
import { measurePaths } from './drawing';
import { elementBounds, cameraForElement, viewBoxFor, viewFromRect, type Bounds } from './camera';
import { textToPaths, boldStrokeWidth, type TextOptions } from './textToPaths';
import { normalizeSvg, type NormalizedSvg } from './svgImport';
import { SHAPES } from '../assets/shapes';
import type { LibraryAsset } from '../assets/library';
import { paperDef, isDarkPaper } from '../assets/paper';
import { loadLibrarySvg, pictureSrc, type LibraryEntry } from '../assets/illustrations';
import { loadRasterImage } from './images';
import { scribblePath } from './scribble';
import type { GalleryItem } from './gallery';
import type { SketchResult } from './sketch';
import { clamp } from './time';

function ink(): string {
  return paperDef(useStore.getState().project.paper).ink;
}

/**
 * Position (and possibly reduced scale) for a new element so it lands in
 * free space inside the area the user is currently looking at: first to the
 * right of the last element, else the free spot nearest the centre of the
 * view, else the least crowded spot.
 */
type Placement = { x: number; y: number; scale: number } & Pick<DrawElement, 'camera' | 'customCamera' | 'transitionIn'>;

const TRANSITION_STAY = 0.3;    // small beat between elements sharing a shot
const TRANSITION_MOVE = 0.8;    // camera travel into a new shot

/**
 * Which shot a newly placed element belongs to. If the previous element's
 * shot already contains it (the user hasn't moved the boundary away), the
 * camera stays; otherwise the current boundary becomes a new shot.
 */
function shotFor(bounds: Bounds): Pick<DrawElement, 'camera' | 'customCamera' | 'transitionIn'> {
  const { project, elements, cameraBoundary } = useStore.getState();
  const order = sequenceOrder(elements);
  if (order.length > 0) {
    const prev = viewBoxFor(cameraForElement(order.length - 1, order, project), project);
    const tol = Math.min(prev.width, prev.height) * 0.04;
    const inside =
      bounds.x >= prev.x - tol && bounds.y >= prev.y - tol &&
      bounds.x + bounds.width <= prev.x + prev.width + tol &&
      bounds.y + bounds.height <= prev.y + prev.height + tol;
    if (inside) return { camera: 'previous', transitionIn: TRANSITION_STAY };
  }
  const rect = cameraBoundary ?? { x: 0, y: 0, width: project.width, height: project.height };
  return { camera: 'custom', customCamera: viewFromRect(rect, project), transitionIn: TRANSITION_MOVE };
}

function placeNew(paths: string[], scale: number, attempt = 0): Placement {
  const { project, elements, cameraBoundary } = useStore.getState();
  const b = measurePaths(paths).bbox;
  // the region we place into: the camera boundary on screen, or the video frame
  const region = cameraBoundary ?? { x: 0, y: 0, width: project.width, height: project.height };
  const margin = Math.max(40, Math.min(region.width, region.height) * 0.06);
  const gap = Math.max(40, Math.min(region.width, region.height) * 0.05);

  // never larger than the region's usable area
  const maxW = region.width - 2 * margin;
  const maxH = region.height - 2 * margin;
  if (b.width * scale > maxW || b.height * scale > maxH) {
    scale = Math.min(maxW / Math.max(b.width, 1), maxH / Math.max(b.height, 1));
  }
  const w = b.width * scale;
  const h = b.height * scale;

  // top-left → transform origin, plus the shot this element belongs to
  const at = (left: number, top: number): Placement => ({
    x: left - b.x * scale,
    y: top - b.y * scale,
    scale,
    ...shotFor({ x: left, y: top, width: w, height: h }),
  });

  const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
  const order = sequenceOrder(elements);
  const taken = order.map(elementBounds);
  if (taken.length === 0) return at(centre.x - w / 2, centre.y - h / 2);

  // existing elements are inflated by the gap so new ones keep clear of them
  const pad = gap * 0.6;
  const overlapArea = (left: number, top: number) =>
    taken.reduce((sum, r) => {
      const ox = Math.max(0, Math.min(left + w, r.x + r.width + pad) - Math.max(left, r.x - pad));
      const oy = Math.max(0, Math.min(top + h, r.y + r.height + pad) - Math.max(top, r.y - pad));
      return sum + ox * oy;
    }, 0);
  const inside = (left: number, top: number) =>
    left >= region.x + margin / 2 && top >= region.y + margin / 2 &&
    left + w <= region.x + region.width - margin / 2 && top + h <= region.y + region.height - margin / 2;

  // right of the last element, vertically centred on it (when that is in view)
  const last = taken[taken.length - 1];
  const rightLeft = last.x + last.width + gap;
  const rightTop = last.y + last.height / 2 - h / 2;
  if (inside(rightLeft, rightTop) && overlapArea(rightLeft, rightTop) === 0) {
    return at(rightLeft, rightTop);
  }

  // candidate spots across the region, nearest the centre first
  const cols = 16, rows = 10;
  const spots: { left: number; top: number; d: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = region.x + margin + ((region.width - 2 * margin - w) * c) / (cols - 1);
      const top = region.y + margin + ((region.height - 2 * margin - h) * r) / (rows - 1);
      spots.push({ left, top, d: Math.hypot(left + w / 2 - centre.x, top + h / 2 - centre.y) });
    }
  }
  spots.sort((a, b2) => a.d - b2.d);
  let best = { left: centre.x - w / 2, top: centre.y - h / 2, score: Infinity };
  for (const sp of spots) {
    const score = overlapArea(sp.left, sp.top);
    if (score === 0) return at(sp.left, sp.top);
    if (score < best.score) best = { left: sp.left, top: sp.top, score };
  }
  // no free room at this size: try a smaller version before overlapping
  if (attempt < 2) return placeNew(paths, scale * 0.72, attempt + 1);
  return at(best.left, best.top);
}

export async function addTextElement(text: string, fontFamily: string, fontSize: number, opts: TextOptions = {}): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const paths = await textToPaths(text, fontFamily, fontSize, { ...opts, customFonts: useStore.getState().project.fonts });
  if (paths.length === 0) return;
  const color = ink();
  useStore.getState().addElement({
    kind: 'text',
    paths,
    label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
    text,
    fontFamily,
    fontSize,
    fontWeight: opts.bold ? 'bold' : 'normal',
    italic: !!opts.italic,
    align: opts.align,
    lineHeight: opts.lineHeight,
    letterSpacing: opts.letterSpacing,
    rtl: !!opts.rtl,
    strokeColor: color,
    fillColor: color,
    fillAfterDraw: true,
    strokeWidth: 2 + (opts.bold ? boldStrokeWidth(fontSize) : 0),
    drawDuration: clamp(trimmed.length * 0.2, 1.2, 10),
    ...placeNew(paths, 1),
  });
}

export function addShapeElement(shapeId: string): void {
  const shape = SHAPES.find((s) => s.id === shapeId);
  if (!shape) return;
  const paths = shape.paths();
  useStore.getState().addElement({
    kind: 'shape',
    paths,
    label: shape.label,
    strokeColor: ink(),
    strokeWidth: 6,
    drawDuration: 1.5,
    ...placeNew(paths, 1),
  });
}

export function addLibraryElement(asset: LibraryAsset): void {
  const scale = 300 / 24;
  useStore.getState().addElement({
    kind: 'svg',
    paths: asset.paths,
    label: asset.name,
    strokeColor: ink(),
    strokeWidth: 7,
    drawDuration: 2.5,
    ...placeNew(asset.paths, scale),
  });
}

const BLACKS = new Set(['#000', '#000000', 'black', 'rgb(0,0,0)', 'rgb(0, 0, 0)']);

/** Build an 'svg' element from normalized artwork, honouring its colours. */
function svgElementProps(art: NormalizedSvg, label: string, targetSize: number): Partial<DrawElement> & Pick<DrawElement, 'kind' | 'paths'> {
  const { paths, width, height } = art;
  const scale = targetSize / Math.max(width, height, 1);
  const color = ink();
  const dark = isDarkPaper(useStore.getState().project.paper);
  // stroke width in canvas px, from the artwork's own unit size
  const strokeWidth = clamp((Math.max(width, height) / 40) * scale, 3, 10);
  const base = {
    kind: 'svg' as const,
    paths,
    label,
    fillRule: art.evenOdd ? ('evenodd' as const) : undefined,
    strokeColor: color,
    strokeWidth,
    drawDuration: clamp(paths.length * 0.25, 1.5, 6),
    ...placeNew(paths, scale),
  };
  if (art.monochrome) {
    return { ...base, fillColor: 'none', fillAfterDraw: false };
  }
  // coloured artwork: keep per-path colours; on dark paper, swap pure black for the ink
  const swap = (c: string | null) => (c && dark && BLACKS.has(c.toLowerCase()) ? color : c);
  return {
    ...base,
    pathFills: art.fills.map(swap),
    pathStrokes: art.strokes.map(swap),
    fillColor: color,
    fillAfterDraw: true,
    // thin: fill-only shapes borrow their fill as an outline while being drawn
    strokeWidth: clamp((Math.max(width, height) / 400) * scale, 0.8, 2.5),
  };
}

export function addImportedSvg(svgText: string, filename: string): void {
  const art = normalizeSvg(svgText);
  useStore.getState().addElement(svgElementProps(art, filename.replace(/\.svg$/i, ''), 420));
}

export async function addLibraryIllustration(entry: LibraryEntry, opts: { color?: boolean } = {}): Promise<void> {
  const svg = await loadLibrarySvg(pictureSrc(entry, opts.color ?? false));
  const art = normalizeSvg(svg);
  const size = entry.category === 'Sketch people' ? 620 : entry.category === 'Illustrations' ? 560 : entry.category === 'Cartoons' ? 380 : 300;
  useStore.getState().addElement(svgElementProps(art, entry.name, size));
}

export function addImageElement(image: ImageRef, label: string): void {
  const paths = [scribblePath(image.width, image.height)];
  const scale = 520 / Math.max(image.width, image.height, 1);
  useStore.getState().addElement({
    kind: 'image',
    paths,
    image,
    label,
    fillColor: 'none',
    strokeColor: '#000000',
    strokeWidth: 1,
    drawDuration: 3,
    ...placeNew(paths, scale),
  });
}

export async function addImageFile(file: File): Promise<ImageRef> {
  const img = await loadRasterImage(file);
  addImageElement(img, file.name.replace(/\.[^.]+$/, ''));
  return img;
}

export async function addGalleryItem(item: GalleryItem): Promise<void> {
  if (item.kind === 'image') {
    addImageElement({ src: item.data, width: item.width, height: item.height }, item.name);
  } else {
    addImportedSvg(item.data, item.name);
  }
}

/** Re-ink every element when the paper changes between light and dark. */
export function reinkForPaper(prevInk: string, nextInk: string): void {
  const { elements, updateElement } = useStore.getState();
  for (const el of elements) {
    const patch: Partial<DrawElement> = {};
    if (el.strokeColor.toLowerCase() === prevInk.toLowerCase()) patch.strokeColor = nextInk;
    if (el.fillColor.toLowerCase() === prevInk.toLowerCase()) patch.fillColor = nextInk;
    if (Object.keys(patch).length) updateElement(el.id, patch);
  }
}

/** Add an offline photo-sketch as pen strokes the hand draws. */
export function addSketchElement(sketch: SketchResult, label: string): void {
  const size = 560;
  const scale = size / Math.max(sketch.width, sketch.height, 1);
  useStore.getState().addElement({
    kind: 'svg',
    paths: sketch.paths,
    label,
    strokeColor: ink(),
    fillColor: 'none',
    fillAfterDraw: false,
    strokeWidth: 3,
    // roughly 900 canvas-px of line per second, within sensible bounds
    drawDuration: clamp((sketch.totalLength * scale) / 900, 2, 14),
    ...placeNew(sketch.paths, scale),
  });
}

/** Add text at one of three sizes (from the AI planner). */
export async function addTextSized(text: string, size: 'title' | 'normal' | 'small'): Promise<void> {
  const px = size === 'title' ? 190 : size === 'small' ? 96 : 140;
  await addTextElement(text, 'caveat', px);
}
