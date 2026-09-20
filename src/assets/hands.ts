// Photographic drawing hands (src/assets/hands/*.webp, see CREDITS.md). Each is a
// top-down cut-out with the pen tip at (tipX, tipY) in image pixels and the
// arm running toward the lower-right. Because every source photo ends at its
// frame edge, a long sleeve is drawn from the wrist outward so the arm always
// continues off-screen — a person reaching in from outside the board.

import type { CustomHand, HandStyle, Project } from '../types';
// Inlined as data: URLs so the hands are part of the bundle — never a
// separate request that can fail — and export can embed them directly.
import markerSrc from './hands/marker.webp?inline';
import penSrc from './hands/pen.webp?inline';
import chalkSrc from './hands/chalk.webp?inline';

export interface SleeveDef {
  x: number;      // wrist centre, image px
  y: number;
  angle: number;  // arm direction, degrees (screen coords, y down)
  hw0: number;    // half-width at the cuff
  hw1: number;    // half-width 260px along the arm
}

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
  /** built-in hands get a drawn sleeve; uploaded hands are used as-is */
  sleeve?: SleeveDef;
  /** draw the picture flipped horizontally (a left hand made from a right-hand photo) */
  mirror?: boolean;
}

const RIGHT_HANDS: HandDef[] = [
  {
    id: 'marker', label: 'Marker', description: 'Black felt-tip — classic whiteboard look',
    src: markerSrc, width: 725, height: 734, tipX: 218, tipY: 13, frameFraction: 0.72,
    sleeve: { x: 440, y: 505, angle: 32, hw0: 88, hw1: 125 },
  },
  {
    id: 'pen', label: 'Pen', description: 'Ballpoint pen — notebook feel',
    src: penSrc, width: 576, height: 640, tipX: 15, tipY: 106, frameFraction: 0.66,
    sleeve: { x: 365, y: 360, angle: 79, hw0: 105, hw1: 150 },
  },
  {
    id: 'chalk', label: 'Chalk', description: 'White paint marker — for chalkboards',
    src: chalkSrc, width: 748, height: 722, tipX: 229, tipY: 13, frameFraction: 0.72,
    sleeve: { x: 455, y: 495, angle: 28, hw0: 92, hw1: 128 },
  },
];

/** The same photo flipped: a left hand whose arm comes in from the left. */
function mirrored(def: HandDef): HandDef {
  return {
    ...def,
    id: `${def.id}-left`,
    label: `${def.label} · left hand`,
    description: `${def.description} — left-handed, arm from the left`,
    tipX: def.width - def.tipX,
    mirror: true,
  };
}

/** Photographic hands: each as a right hand (arm from the right) and a left hand. */
export const HANDS: HandDef[] = RIGHT_HANDS.flatMap((h) => [
  { ...h, label: `${h.label} · right hand`, description: `${h.description} — right-handed, arm from the right` },
  mirrored(h),
]);

export const CUSTOM_PREFIX = 'custom:';

export function customHandDef(h: CustomHand): HandDef {
  return {
    id: `${CUSTOM_PREFIX}${h.id}`,
    label: h.name,
    description: 'Your own hand',
    src: h.src,
    width: h.width,
    height: h.height,
    tipX: h.tipX,
    tipY: h.tipY,
    frameFraction: h.frameFraction ?? 0.7,
  };
}

/** Resolve a hand style; `project` supplies the user's uploaded hands. */
/** Hands shipped with the app. */
export const BUILT_IN_HANDS: HandDef[] = HANDS;

export function handDef(style: HandStyle, project?: Pick<Project, 'customHands'>): HandDef | null {
  if (style === 'none') return null;
  if (style.startsWith(CUSTOM_PREFIX)) {
    const id = style.slice(CUSTOM_PREFIX.length);
    const custom = project?.customHands?.find((h) => h.id === id);
    return custom ? customHandDef(custom) : HANDS[0];
  }
  return BUILT_IN_HANDS.find((h) => h.id === style) ?? HANDS[0];
}

/** Every hand available to a project (built-in + uploaded). */
export function allHands(project?: Pick<Project, 'customHands'>): HandDef[] {
  return [...BUILT_IN_HANDS, ...(project?.customHands ?? []).map(customHandDef)];
}

// --- SVG markup ---------------------------------------------------------

const SLEEVE_LENGTH = 9000; // image px — far beyond any frame at any zoom
export const CUFF = 48;

export function sleevePath(s: SleeveDef, fromX = 0): string {
  const { hw0, hw1 } = s;
  const hw2 = hw1 * 1.15;
  const c = hw0 * 0.35; // cuff edge bulges toward the hand
  const L = SLEEVE_LENGTH;
  return (
    `M${fromX} ${-hw0}L260 ${-hw1}L${L} ${-hw2}L${L} ${hw2}L260 ${hw1}L${fromX} ${hw0}` +
    `Q${fromX - c} 0 ${fromX} ${-hw0}Z`
  );
}

export function cuffPath(s: SleeveDef): string {
  const { hw0, hw1 } = s;
  const c = hw0 * 0.35;
  const hwC = hw0 + ((hw1 - hw0) * CUFF) / 260;
  return `M0 ${-hw0}L${CUFF} ${-hwC}L${CUFF} ${hwC}L0 ${hw0}Q${-c} 0 0 ${-hw0}Z`;
}

/**
 * Inner markup for a hand: the photo plus the sleeve extension, in the hand's
 * image-pixel coordinate space (wrap it in the tip-anchoring transform).
 * Shared by the live canvas and the export serializer. `href` is the image
 * URL (or a data: URL when exporting).
 */
export function handInnerSvg(def: HandDef, href: string): string {
  const s = def.sleeve;
  if (!s) return `<image href="${href}" width="${def.width}" height="${def.height}"/>`;
  // a mirrored hand is the unflipped picture inside a horizontal flip
  const inner = handInnerSvgUnflipped(def, href, s);
  return def.mirror ? `<g transform="translate(${def.width} 0) scale(-1 1)">${inner}</g>` : inner;
}

function handInnerSvgUnflipped(def: HandDef, href: string, s: SleeveDef): string {
  const gid = `sleeve-${def.id}`;
  const hw2 = s.hw1 * 1.15;
  return (
    `<defs>` +
      `<linearGradient id="${gid}-g" gradientUnits="userSpaceOnUse" x1="0" y1="${-hw2}" x2="0" y2="${hw2}">` +
        `<stop offset="0" stop-color="#242935"/><stop offset="0.45" stop-color="#363d4d"/>` +
        `<stop offset="1" stop-color="#1f232c"/></linearGradient>` +
      `<filter id="${gid}-blur" x="-10%" y="-10%" width="120%" height="120%">` +
        `<feGaussianBlur stdDeviation="11"/></filter>` +
    `</defs>` +
    // sleeve shadow (offset like the hand's baked shadow)
    `<g transform="translate(14 16)"><g transform="translate(${s.x} ${s.y}) rotate(${s.angle})">` +
      `<path d="${sleevePath(s)}" fill="#141820" opacity="0.3" filter="url(#${gid}-blur)"/>` +
    `</g></g>` +
    `<image href="${href}" width="${def.width}" height="${def.height}"/>` +
    `<g transform="translate(${s.x} ${s.y}) rotate(${s.angle})">` +
      `<path d="${sleevePath(s)}" fill="url(#${gid}-g)"/>` +
      `<path d="${cuffPath(s)}" fill="#3d4557"/>` +
      `<path d="M${CUFF} ${-(s.hw0 + ((s.hw1 - s.hw0) * CUFF) / 260)}L${CUFF} ${s.hw0 + ((s.hw1 - s.hw0) * CUFF) / 260}" ` +
        `stroke="#1c2029" stroke-width="3" opacity="0.7"/>` +
    `</g>`
  );
}

// --- image loading (shared by preview + export) ------------------------

/** Hand image as a data: URL for embedding in a serialized SVG (already inline). */
export function loadHandDataUrl(def: HandDef): Promise<string> {
  return Promise.resolve(def.src);
}
