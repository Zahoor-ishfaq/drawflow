// Built-in shape generators → SVG path 'd' strings (local units, origin at
// the shape's top-left-ish; elements position them via their transform).

export interface ShapeDef {
  id: string;
  label: string;
  paths: () => string[];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${cx - rx} ${cy}` +
    `a${rx} ${ry} 0 1 0 ${rx * 2} 0` +
    `a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`
  );
}

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d + 'Z';
}

export const SHAPES: ShapeDef[] = [
  {
    id: 'rect',
    label: 'Rectangle',
    paths: () => ['M0 0H260V180H0Z'],
  },
  {
    id: 'rounded-rect',
    label: 'Rounded rect',
    paths: () => [
      'M24 0H236a24 24 0 0 1 24 24V156a24 24 0 0 1-24 24H24a24 24 0 0 1-24-24V24A24 24 0 0 1 24 0Z',
    ],
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    paths: () => [ellipsePath(120, 90, 120, 90)],
  },
  {
    id: 'line',
    label: 'Line',
    paths: () => ['M0 0L260 0'],
  },
  {
    id: 'arrow',
    label: 'Arrow',
    paths: () => ['M0 60L230 60', 'M180 15L240 60L180 105'],
  },
  {
    id: 'star',
    label: 'Star',
    paths: () => [starPath(110, 110, 110, 44)],
  },
  {
    id: 'check',
    label: 'Checkmark',
    paths: () => ['M0 90L70 160L200 0'],
  },
  {
    id: 'speech-bubble',
    label: 'Speech bubble',
    paths: () => [
      'M20 0H240a20 20 0 0 1 20 20V120a20 20 0 0 1-20 20H90L40 170V140H20a20 20 0 0 1-20-20V20A20 20 0 0 1 20 0Z',
    ],
  },
];
