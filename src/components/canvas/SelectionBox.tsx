import type { DrawElement } from '../../types';
import { applyTransform, measurePaths } from '../../lib/drawing';

const ACCENT = '#0d9d97';

interface SelectionBoxProps {
  element: DrawElement;
  /** current viewport zoom, to keep handle/stroke sizes constant on screen */
  zoom: number;
  onHandleDown: (e: React.PointerEvent) => void;
}

export function SelectionBox({ element: el, zoom, onHandleDown }: SelectionBoxProps) {
  const m = measurePaths(el.paths);
  const b = m.bbox;
  const z = zoom || 1;
  const pad = 8 / z / el.scale;
  const corners = [
    { x: b.x - pad, y: b.y - pad },
    { x: b.x + b.width + pad, y: b.y - pad },
    { x: b.x + b.width + pad, y: b.y + b.height + pad },
    { x: b.x - pad, y: b.y + b.height + pad },
  ].map((p) => applyTransform(p.x, p.y, el.x, el.y, el.rotation, el.scale));

  const sw = 1.5 / z;
  const hr = 5.5 / z; // handle radius

  return (
    <g pointerEvents="none">
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={ACCENT}
        strokeWidth={sw}
      />
      {corners.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={hr}
          fill="#ffffff"
          stroke={ACCENT}
          strokeWidth={sw}
          pointerEvents="all"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={onHandleDown}
        />
      ))}
    </g>
  );
}
