// Helpers that turn user gestures (add text / shape / import) into store
// elements, centered on the artboard with sensible defaults.

import { useStore } from '../store/useStore';
import { measurePaths } from './drawing';
import { textToPaths } from './textToPaths';
import { normalizeSvg } from './svgImport';
import { SHAPES } from '../assets/shapes';
import type { LibraryAsset } from '../assets/library';
import { clamp } from './time';

const INK = '#1a1a1a';

function centerOn(paths: string[], scale: number): { x: number; y: number } {
  const { project } = useStore.getState();
  const b = measurePaths(paths).bbox;
  return {
    x: project.width / 2 - (b.x + b.width / 2) * scale,
    y: project.height / 2 - (b.y + b.height / 2) * scale,
  };
}

export async function addTextElement(text: string, fontFamily: string, fontSize: number): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const paths = await textToPaths(text, fontFamily, fontSize);
  if (paths.length === 0) return;
  const pos = centerOn(paths, 1);
  useStore.getState().addElement({
    kind: 'text',
    paths,
    label: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
    text,
    fontFamily,
    fontSize,
    strokeColor: INK,
    fillColor: INK,
    fillAfterDraw: true,
    strokeWidth: 2,
    drawDuration: clamp(trimmed.length * 0.12, 1, 8),
    ...pos,
  });
}

export function addShapeElement(shapeId: string): void {
  const shape = SHAPES.find((s) => s.id === shapeId);
  if (!shape) return;
  const paths = shape.paths();
  const pos = centerOn(paths, 1);
  useStore.getState().addElement({
    kind: 'shape',
    paths,
    label: shape.label,
    strokeColor: INK,
    strokeWidth: 5,
    drawDuration: 1.5,
    ...pos,
  });
}

export function addLibraryElement(asset: LibraryAsset): void {
  const scale = 320 / 24;
  const pos = centerOn(asset.paths, scale);
  useStore.getState().addElement({
    kind: 'svg',
    paths: asset.paths,
    label: asset.name,
    scale,
    strokeColor: INK,
    strokeWidth: 7,
    drawDuration: 2.5,
    ...pos,
  });
}

export function addImportedSvg(svgText: string, filename: string): void {
  const { paths, width, height } = normalizeSvg(svgText);
  const scale = 480 / Math.max(width, height, 1);
  const pos = centerOn(paths, scale);
  useStore.getState().addElement({
    kind: 'svg',
    paths,
    label: filename.replace(/\.svg$/i, ''),
    scale,
    strokeColor: INK,
    strokeWidth: 4,
    drawDuration: 3,
    ...pos,
  });
}
