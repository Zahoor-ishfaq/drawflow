import type { DrawElement } from '../../types';
import { applyTransform } from '../../lib/drawing';
import { localBounds } from '../../lib/camera';

const ACCENT = '#0d9d97';

interface SelectionBoxProps {
  element: DrawElement;
  /** current viewport zoom, to keep handle/stroke sizes constant on screen */
  zoom: number;
  /** show scale handles (single selection only) */
  handles: boolean;
  /** true for a locked element: thin dashed outline, no handles */
  locked?: boolean;
  onHandleDown?: (e: React.PointerEvent) => void;
  onRotateDown?: (e: React.PointerEvent) => void;
}

export function SelectionBox({ element: el, zoom, handles, locked, onHandleDown, onRotateDown }: SelectionBoxProps) {
  const b = localBounds(el);
  const z = zoom || 1;
  const pad = 8 / z / el.scale;
  const sx = el.flipX ? -1 : 1, sy = el.flipY ? -1 : 1;
  const map = (px: number, py: number) => applyTransform(px * sx, py * sy, el.x, el.y, el.rotation, el.scale);
  const corners = [
    map(b.x - pad, b.y - pad),
    map(b.x + b.width + pad, b.y - pad),
    map(b.x + b.width + pad, b.y + b.height + pad),
    map(b.x - pad, b.y + b.height + pad),
  ];
  // rotation grip above the top edge (in the element's rotated frame)
  const topMid = map(b.x + b.width / 2, b.y - pad - 26 / z / el.scale);

  const sw = 1.5 / z;
  const hr = 5.5 / z; // handle radius

  return (
    <g pointerEvents="none">
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={ACCENT}
        strokeWidth={sw}
        strokeDasharray={locked ? `${4 / z} ${3 / z}` : undefined}
        strokeOpacity={handles ? 1 : 0.7}
      />
      {handles && !locked && corners.map((p, i) => (
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
      {handles && !locked && onRotateDown && (
        <>
          <line x1={(corners[0].x + corners[1].x) / 2} y1={(corners[0].y + corners[1].y) / 2} x2={topMid.x} y2={topMid.y} stroke={ACCENT} strokeWidth={sw} />
          <circle
            cx={topMid.x}
            cy={topMid.y}
            r={hr}
            fill="#ffffff"
            stroke={ACCENT}
            strokeWidth={sw}
            pointerEvents="all"
            style={{ cursor: 'grab' }}
            onPointerDown={onRotateDown}
          />
        </>
      )}
    </g>
  );
}
