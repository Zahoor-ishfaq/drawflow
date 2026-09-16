// Helpers that turn user gestures (add text / shape / import) into store
// elements. New elements flow left-to-right, top-to-bottom across the
// artboard so a scribe built by just clicking "add" already reads well.

import { sequenceOrder, useStore } from '../store/useStore';
import type { DrawElement, ImageRef } from '../types';
import { measurePaths } from './drawing';
import { elementBounds } from './camera';
import { textToPaths } from './textToPaths';
import { normalizeSvg, type NormalizedSvg } from './svgImport';
import { SHAPES } from '../assets/shapes';
import type { LibraryAsset } from '../assets/library';
import { paperDef, isDarkPaper } from '../assets/paper';
import { loadLibrarySvg, type LibraryEntry } from '../assets/illustrations';
import { loadRasterImage } from './images';
import { scribblePath } from './scribble';
import type { GalleryItem } from './gallery';
import { clamp } from './time';

const MARGIN = 120;
const GAP = 90;

function ink(): string {
  return paperDef(useStore.getState().project.paper).ink;
}

/**
 * Position (and possibly reduced scale) for a new element so it lands in
 * free space on the board: first to the right of the last element, else the
 * spot with the least overlap, scanning in reading order.
 */
function placeNew(paths: string[], scale: number): { x: number; y: number; scale: number } {
  const { project, elements } = useStore.getState();
  const b = measurePaths(paths).bbox;
  const W = project.width;
  const H = project.height;

  // never larger than the board's usable area
  const maxW = W - 2 * MARGIN;
  const maxH = H - 2 * MARGIN;
  if (b.width * scale > maxW || b.height * scale > maxH) {
    scale = Math.min(maxW / Math.max(b.width, 1), maxH / Math.max(b.height, 1));
  }
  const w = b.width * scale;
  const h = b.height * scale;

  // top-left → transform origin
  const at = (left: number, top: number) => ({ x: left - b.x * scale, y: top - b.y * scale, scale });

  const order = sequenceOrder(elements);
  if (order.length === 0) return at((W - w) / 2, (H - h) / 2);
  const taken = order.map(elementBounds);

  const overlapArea = (left: number, top: number) =>
    taken.reduce((sum, r) => {
      const ox = Math.max(0, Math.min(left + w, r.x + r.width) - Math.max(left, r.x));
      const oy = Math.max(0, Math.min(top + h, r.y + r.height) - Math.max(top, r.y));
      return sum + ox * oy;
    }, 0);

  // right of the last element, vertically centred on it
  const last = taken[taken.length - 1];
  const rightLeft = last.x + last.width + GAP;
  const rightTop = clamp(last.y + last.height / 2 - h / 2, MARGIN / 2, H - MARGIN / 2 - h);
  if (rightLeft + w <= W - MARGIN / 2 && overlapArea(rightLeft, rightTop) === 0) {
    return at(rightLeft, rightTop);
  }

  // scan candidate spots in reading order; take the first free one, else the least crowded
  let best = { left: (W - w) / 2, top: (H - h) / 2, score: Infinity };
  const cols = 16, rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = MARGIN / 2 + ((W - MARGIN - w) * c) / (cols - 1);
      const top = MARGIN / 2 + ((H - MARGIN - h) * r) / (rows - 1);
      if (left < 0 || top < 0) continue;
      const score = overlapArea(left, top);
      if (score === 0) return at(left, top);
      if (score < best.score) best = { left, top, score };
    }
  }
  return at(best.left, best.top);
}

export async function addTextElement(text: string, fontFamily: string, fontSize: number): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const paths = await textToPaths(text, fontFamily, fontSize);
  if (paths.length === 0) return;
  const color = ink();
  useStore.getState().addElement({
    kind: 'text',
    paths,
    label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
    text,
    fontFamily,
    fontSize,
    strokeColor: color,
    fillColor: color,
    fillAfterDraw: true,
    strokeWidth: 2,
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

export async function addLibraryIllustration(entry: LibraryEntry): Promise<void> {
  const svg = await loadLibrarySvg(entry.src);
  const art = normalizeSvg(svg);
  const size = entry.category === 'Sketch people' ? 620 : 300;
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
