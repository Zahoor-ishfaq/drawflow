// Paper presets ("Set paper" in VideoScribe). Patterns are anchored to canvas
// space so they stay put while the camera moves. The defs string is shared by
// the live canvas and the export serializer.

import type { PaperStyle } from '../types';

export interface PaperDef {
  id: PaperStyle;
  label: string;
  /** base colour (also used when the user picks a custom colour) */
  color: string;
  /** default ink colour for new elements on this paper */
  ink: string;
  /** fill for the paper rect */
  fill: (color: string) => string;
  /** SVG <defs> content, if the paper uses a pattern */
  defs: (color: string) => string;
  /** whether the user may override the colour */
  customColor: boolean;
}

const LINE = 'rgba(70, 110, 160, 0.16)';

export const PAPERS: PaperDef[] = [
  {
    id: 'plain', label: 'Plain', color: '#ffffff', ink: '#1a1a1a', customColor: true,
    fill: (c) => c, defs: () => '',
  },
  {
    id: 'cream', label: 'Cream', color: '#fbf5e6', ink: '#2b2418', customColor: false,
    fill: (c) => c, defs: () => '',
  },
  {
    id: 'grid', label: 'Grid', color: '#ffffff', ink: '#1a1a1a', customColor: true,
    fill: () => 'url(#paper-grid)',
    defs: (c) =>
      `<pattern id="paper-grid" width="80" height="80" patternUnits="userSpaceOnUse">` +
      `<rect width="80" height="80" fill="${c}"/>` +
      `<path d="M80 0H0V80" fill="none" stroke="${LINE}" stroke-width="1.5"/></pattern>`,
  },
  {
    id: 'dots', label: 'Dots', color: '#ffffff', ink: '#1a1a1a', customColor: true,
    fill: () => 'url(#paper-dots)',
    defs: (c) =>
      `<pattern id="paper-dots" width="60" height="60" patternUnits="userSpaceOnUse">` +
      `<rect width="60" height="60" fill="${c}"/>` +
      `<circle cx="30" cy="30" r="2.2" fill="rgba(70,90,120,0.22)"/></pattern>`,
  },
  {
    id: 'lined', label: 'Lined', color: '#fdfdfb', ink: '#1f2a44', customColor: false,
    fill: () => 'url(#paper-lined)',
    defs: (c) =>
      `<pattern id="paper-lined" width="100" height="90" patternUnits="userSpaceOnUse">` +
      `<rect width="100" height="90" fill="${c}"/>` +
      `<path d="M0 89.5H100" fill="none" stroke="rgba(90,140,200,0.28)" stroke-width="1.6"/></pattern>`,
  },
  {
    id: 'kraft', label: 'Kraft', color: '#d8bf98', ink: '#3a2a1a', customColor: false,
    fill: (c) => c, defs: () => '',
  },
  {
    id: 'chalkboard', label: 'Chalkboard', color: '#2c473d', ink: '#f3f3ee', customColor: false,
    fill: (c) => c, defs: () => '',
  },
];

export function paperDef(id: PaperStyle): PaperDef {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

export function isDarkPaper(id: PaperStyle): boolean {
  return id === 'chalkboard';
}
