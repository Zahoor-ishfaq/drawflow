import { memo } from 'react';
import type { DrawElement } from '../../types';
import { elementFrameAt } from '../../lib/renderFrame';
import { measurePaths } from '../../lib/drawing';

interface ElementNodeProps {
  element: DrawElement;
  currentTime: number;
  onPointerDown: (e: React.PointerEvent, el: DrawElement) => void;
}

export const ElementNode = memo(function ElementNode({
  element: el,
  currentTime,
  onPointerDown,
}: ElementNodeProps) {
  const frame = elementFrameAt(el, currentTime);
  if (!frame) return null;
  const bbox = measurePaths(el.paths).bbox;

  return (
    <g
      transform={`translate(${el.x} ${el.y}) rotate(${el.rotation}) scale(${el.scale})`}
      opacity={frame.groupOpacity}
      onPointerDown={(e) => onPointerDown(e, el)}
      style={{ cursor: 'move' }}
    >
      {/* transparent bbox hit area so the whole element is clickable/draggable */}
      <rect
        x={bbox.x}
        y={bbox.y}
        width={Math.max(bbox.width, 1)}
        height={Math.max(bbox.height, 1)}
        fill="transparent"
        stroke="none"
      />
      {el.paths.map((d, i) => {
        const dash = frame.dashes?.[i];
        return (
          <path
            key={i}
            d={d}
            fill={el.fillColor}
            fillOpacity={frame.fillOpacity}
            stroke={el.strokeColor}
            strokeWidth={el.strokeWidth / el.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash?.strokeDasharray}
            strokeDashoffset={dash?.strokeDashoffset}
          />
        );
      })}
    </g>
  );
});
