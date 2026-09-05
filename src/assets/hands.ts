// Hand-with-pen artwork, drawn as raw path data so it can be rendered both by
// React (preview) and by the SVG string serializer (export). Coordinate space:
// the pen tip is at (0,0) and the hand extends toward +x/+y (lower right),
// which matches a right-handed writer entering from the bottom-right.

import type { HandStyle, Project } from '../types';

export interface HandPart {
  d: string;
  fill: string;
  stroke?: string;
  sw?: number;
  t?: string; // optional transform for the part
}

const SKIN = '#e9bd93';
const SKIN_LINE = '#c99a6d';

function handCluster(dx: number, dy: number): HandPart[] {
  const t = `translate(${dx} ${dy})`;
  return [
    // sleeve
    {
      d: 'M100 54 A62 62 0 0 1 54 100 L80 126 A98 98 0 0 0 126 80 Z',
      fill: '#3d3d47', t,
    },
    // fist
    {
      d: 'M32 64a32 32 0 1 0 64 0a32 32 0 1 0 -64 0Z',
      fill: SKIN, stroke: SKIN_LINE, sw: 2.5, t,
    },
    // finger creases
    { d: 'M50 82q16-2 24-16', fill: 'none', stroke: SKIN_LINE, sw: 2, t },
    { d: 'M60 92q16-4 24-18', fill: 'none', stroke: SKIN_LINE, sw: 2, t },
  ];
}

function thumb(dx: number, dy: number): HandPart {
  return {
    d: 'M20 32 Q26 16 42 24 L58 42 Q64 56 50 56 L26 44 Q18 40 20 32 Z',
    fill: SKIN, stroke: SKIN_LINE, sw: 2.5,
    t: `translate(${dx} ${dy})`,
  };
}

export const HAND_ARTWORK: Record<Exclude<HandStyle, 'none'>, HandPart[]> = {
  marker: [
    ...handCluster(4, 4),
    // barrel
    { d: 'M14.9 2.1 L55.9 43.1 A9 9 0 0 1 43.1 55.9 L2.1 14.9 A9 9 0 0 1 14.9 2.1 Z', fill: '#26262b' },
    // nib
    { d: 'M0 0 L14.9 2.1 L2.1 14.9 Z', fill: '#111114' },
    thumb(4, 4),
  ],
  pencil: [
    ...handCluster(4, 4),
    // painted barrel
    { d: 'M16.3 6.4 L53 43.1 A7 7 0 0 1 43.1 53 L6.4 16.3 A7 7 0 0 1 16.3 6.4 Z', fill: '#e8b53a' },
    // wood cone + graphite tip
    { d: 'M1.5 1.5 L18 4 L4 18 Z', fill: '#d9a066' },
    { d: 'M0 0 L6.5 1 L1 6.5 Z', fill: '#2f2f33' },
    thumb(4, 4),
  ],
  chalk: [
    ...handCluster(-14, -14),
    // short white stick with a rounded back end
    { d: 'M10.6 -1.6 L32.5 20.3 A7.5 7.5 0 0 1 21.9 30.9 L0 9 A7.5 7.5 0 0 1 10.6 -1.6 Z',
      fill: '#f2f2f4', stroke: '#c9c9cf', sw: 1.5 },
    thumb(-14, -14),
  ],
};

/** Hand size in canvas units, proportional to the artboard. */
export function handScaleFor(project: Project): number {
  return (Math.max(project.width, project.height) / 1920) * 2.1;
}
