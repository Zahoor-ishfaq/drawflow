// Photographic drawing hands (public/hands/*.webp, see CREDITS.md). Each is a
// top-down cut-out with the pen tip at (tipX, tipY) in image pixels and the
// arm running toward the lower-right, the way VideoScribe hands are built.

import type { HandStyle } from '../types';

export interface HandDef {
  id: Exclude<HandStyle, 'none'>;
  label: string;
  description: string;
  src: string;
  width: number;
  height: number;
  tipX: number;
  tipY: number;
  /** image height as a fraction of the camera frame height (constant on screen) */
  frameFraction: number;
}

export const HANDS: HandDef[] = [
  {
    id: 'marker', label: 'Marker', description: 'Black felt-tip — classic whiteboard look',
    src: '/hands/marker.webp', width: 725, height: 734, tipX: 218, tipY: 13, frameFraction: 0.78,
  },
  {
    id: 'pencil', label: 'Pencil', description: 'Yellow HB pencil — sketchbook feel',
    src: '/hands/pencil.webp', width: 585, height: 695, tipX: 22, tipY: 14, frameFraction: 0.58,
  },
  {
    id: 'chalk', label: 'Chalk', description: 'White paint marker — for chalkboards',
    src: '/hands/chalk.webp', width: 748, height: 722, tipX: 229, tipY: 13, frameFraction: 0.78,
  },
];

export function handDef(style: HandStyle): HandDef | null {
  if (style === 'none') return null;
  return HANDS.find((h) => h.id === style) ?? HANDS[0];
}

// --- image loading (shared by preview + export) ------------------------

const dataUrlCache = new Map<string, Promise<string>>();

/** Hand image as a data: URL so it can be embedded in a serialized SVG. */
export function loadHandDataUrl(def: HandDef): Promise<string> {
  let p = dataUrlCache.get(def.id);
  if (!p) {
    p = fetch(def.src)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load hand image (${r.status})`);
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          }),
      );
    dataUrlCache.set(def.id, p);
    p.catch(() => dataUrlCache.delete(def.id));
  }
  return p;
}
