// Flat, cartoon-style hands drawn as SVG (no photo needed): pencil, brush
// and eraser. Same coordinate convention as the photographic hands — the
// tool tip sits at (tipX, tipY) and the arm runs toward the lower right,
// where the shared sleeve extension takes over.

import type { HandDef } from './hands';

const SKIN = '#f3c9a6';
const SKIN_DARK = '#d9a077';
const LINE = '#6b3f22';

/** Hand shape gripping a tool that points to (40, 24). */
function hand(tool: string, toolUnderFingers: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="420" viewBox="0 0 400 420">
  <g stroke="${LINE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    ${tool}
    <!-- palm -->
    <path d="M150 150 C 205 105, 300 120, 330 195 C 355 255, 330 320, 290 350 L 250 395 L 175 395 C 140 340, 105 250, 150 150 Z" fill="${SKIN}"/>
    <!-- fingers wrapped over the tool -->
    <path d="M120 148 C 95 140, 80 165, 100 182 L 190 240 C 210 250, 230 222, 210 208 Z" fill="${SKIN}"/>
    <path d="M100 195 C 78 196, 72 224, 92 236 L 190 285 C 212 292, 226 264, 208 252 Z" fill="${SKIN}"/>
    <path d="M100 250 C 82 258, 84 286, 106 292 L 195 322 C 218 326, 226 298, 208 290 Z" fill="${SKIN}"/>
    <path d="M118 300 C 102 312, 110 338, 132 338 L 205 350 C 228 350, 230 322, 212 316 Z" fill="${SKIN}"/>
    ${toolUnderFingers}
    <!-- thumb -->
    <path d="M182 118 C 150 98, 118 118, 130 150 L 205 200 C 222 210, 240 188, 226 172 Z" fill="${SKIN}"/>
    <path d="M226 172 L 205 200" fill="none" stroke="${SKIN_DARK}" stroke-width="4"/>
  </g>
</svg>`;
}

// tools are drawn along the 45° line from the tip (40,24) toward (300,284)
const PENCIL = `
  <g transform="translate(40 24) rotate(45)">
    <path d="M0 0 L 34 -13 L 34 13 Z" fill="#e8c9a0"/>
    <path d="M0 0 L 12 -4.5 L 12 4.5 Z" fill="#333"/>
    <rect x="34" y="-13" width="220" height="26" rx="3" fill="#f2c14e"/>
    <rect x="254" y="-13" width="16" height="26" fill="#b9b9b9"/>
    <rect x="270" y="-12" width="26" height="24" rx="5" fill="#f19cb0"/>
    <path d="M34 -4 H 254 M34 4 H 254" fill="none" stroke="#d9a63a" stroke-width="2"/>
  </g>`;
const PENCIL_TOP = `<g transform="translate(40 24) rotate(45)"><rect x="150" y="-13" width="100" height="26" rx="3" fill="#f2c14e" stroke="none"/></g>`;

const BRUSH = `
  <g transform="translate(40 24) rotate(45)">
    <path d="M0 0 C 20 -14, 40 -14, 58 -9 L 58 9 C 40 14, 20 14, 0 0 Z" fill="#2a2a2a"/>
    <rect x="58" y="-11" width="30" height="22" fill="#c9c9c9"/>
    <rect x="88" y="-9" width="220" height="18" rx="4" fill="#b5651d"/>
  </g>`;
const BRUSH_TOP = `<g transform="translate(40 24) rotate(45)"><rect x="180" y="-9" width="120" height="18" rx="4" fill="#b5651d" stroke="none"/></g>`;

const ERASER = `
  <g transform="translate(40 24) rotate(45)">
    <rect x="-10" y="-30" width="150" height="60" rx="8" fill="#f3a0b0"/>
    <rect x="60" y="-30" width="30" height="60" fill="#5b8def"/>
    <rect x="-10" y="-30" width="150" height="60" rx="8" fill="none"/>
  </g>`;
const ERASER_TOP = '';

function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SLEEVE = { x: 300, y: 300, angle: 45, hw0: 72, hw1: 98 };

export const CARTOON_HANDS: HandDef[] = [
  {
    id: 'pencil', label: 'Pencil (cartoon)', description: 'Flat illustrated hand with a pencil',
    src: dataUrl(hand(PENCIL, PENCIL_TOP)), width: 400, height: 420, tipX: 40, tipY: 24, frameFraction: 0.6, sleeve: SLEEVE,
  },
  {
    id: 'brush', label: 'Brush (cartoon)', description: 'Flat illustrated hand with a paint brush',
    src: dataUrl(hand(BRUSH, BRUSH_TOP)), width: 400, height: 420, tipX: 40, tipY: 24, frameFraction: 0.6, sleeve: SLEEVE,
  },
  {
    id: 'eraser', label: 'Eraser (cartoon)', description: 'Flat illustrated hand with an eraser — good for erase exits',
    src: dataUrl(hand(ERASER, ERASER_TOP)), width: 400, height: 420, tipX: 40, tipY: 24, frameFraction: 0.6, sleeve: SLEEVE,
  },
];
