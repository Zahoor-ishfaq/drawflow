// Helpers that turn user gestures (add text / shape / import) into store
// elements. New elements flow left-to-right, top-to-bottom across the
// artboard so a scribe built by just clicking "add" already reads well.

import { sequenceOrder, useStore } from '../store/useStore';
import type { DrawElement } from '../types';
import { measurePaths } from './drawing';
import { elementBounds } from './camera';
import { textToPaths } from './textToPaths';
import { normalizeSvg } from './svgImport';
import { SHAPES } from '../assets/shapes';
import type { LibraryAsset } from '../assets/library';
import { paperDef } from '../assets/paper';
import { clamp } from './time';

const MARGIN = 120;
const GAP = 90;

function ink(): string {
  return paperDef(useStore.getState().project.paper).ink;
}

/** Position for a new element with local bbox `b` at `scale`, in canvas coords. */
function placeNew(paths: string[], scale: number): { x: number; y: number } {
  const { project, elements } = useStore.getState();
  const b = measurePaths(paths).bbox;
  const w = b.width * scale;
  const h = b.height * scale;
  const W = project.width;
  const H = project.height;

  // top-left → transform origin
  const at = (left: number, top: number) => ({ x: left - b.x * scale, y: top - b.y * scale });

  const order = sequenceOrder(elements);
  if (order.length === 0) return at((W - w) / 2, (H - h) / 2);

  const last = elementBounds(order[order.length - 1]);
  // try to the right of the last element, vertically centred on it
  const rightLeft = last.x + last.width + GAP;
  if (rightLeft + w <= W - MARGIN) {
    const top = clamp(last.y + last.height / 2 - h / 2, MARGIN, H - MARGIN - h);
    return at(rightLeft, top);
  }
  // new row beneath everything so far
  const bottom = order.reduce((m, el) => Math.max(m, elementBounds(el).y + elementBounds(el).height), 0);
  const rowTop = bottom + GAP;
  if (rowTop + h <= H - MARGIN / 2) return at(MARGIN, rowTop);
  // out of room — stack near the centre with a small offset
  const n = order.length;
  return at((W - w) / 2 + (n % 5) * 40, (H - h) / 2 + (n % 5) * 40);
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
    scale,
    strokeColor: ink(),
    strokeWidth: 7,
    drawDuration: 2.5,
    ...placeNew(asset.paths, scale),
  });
}

export function addImportedSvg(svgText: string, filename: string): void {
  const { paths, width, height } = normalizeSvg(svgText);
  const scale = 420 / Math.max(width, height, 1);
  useStore.getState().addElement({
    kind: 'svg',
    paths,
    label: filename.replace(/\.svg$/i, ''),
    scale,
    strokeColor: ink(),
    strokeWidth: 4,
    drawDuration: 3,
    ...placeNew(paths, scale),
  });
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
