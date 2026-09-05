import type { DrawElement } from '../../types';
import { applyTransform, measurePaths } from '../../lib/drawing';

interface SelectionBoxProps {
  element: DrawElement;
  /** current viewport zoom, to keep handle/stroke sizes constant on screen */
  zoom: number;
  onHandleDown: (e: React.PointerEvent) => void;
}

export function SelectionBox({ element: el, zoom, onHandleDown }: SelectionBoxProps) {
  const m = measurePaths(el.paths);
  const b = m.bbox;
  const pad = 6 / (zoom || 1) / el.scale;
  const corners = [
    { x: b.x - pad, y: b.y - pad },
    { x: b.x + b.width + pad, y: b.y - pad },
    { x: b.x + b.width + pad, y: b.y + b.height + pad },
    { x: b.x - pad, y: b.y + b.height + pad },
  ].map((p) => applyTransform(p.x, p.y, el.x, el.y, el.rotation, el.scale));

  const edges = [
    mid(corners[0], corners[1]),
    mid(corners[1], corners[2]),
    mid(corners[2], corners[3]),
    mid(corners[3], corners[0]),
  ];

  const sw = 1 / (zoom || 1);
  const hs = 4.5 / (zoom || 1);

  return (
    <g pointerEvents="none">
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#4f8cff"
        strokeWidth={sw}
        strokeDasharray={`${4 / (zoom || 1)} ${3 / (zoom || 1)}`}
      />
      {[...corners, ...edges].map((p, i) => (
        <rect
          key={i}
          x={p.x - hs}
          y={p.y - hs}
          width={hs * 2}
          height={hs * 2}
          fill="#ffffff"
          stroke="#4f8cff"
          strokeWidth={sw}
          pointerEvents="all"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={onHandleDown}
        />
      ))}
    </g>
  );
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
