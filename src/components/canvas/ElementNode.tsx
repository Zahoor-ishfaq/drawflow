import { memo } from 'react';
import type { DrawElement } from '../../types';
import { elementFrameAt } from '../../lib/renderFrame';

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

  return (
    <g
      transform={`translate(${el.x} ${el.y}) rotate(${el.rotation}) scale(${el.scale})`}
      opacity={frame.groupOpacity}
      onPointerDown={(e) => onPointerDown(e, el)}
      style={{ cursor: 'move' }}
    >
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
            // an invisible fat stroke keeps thin strokes clickable
            pointerEvents="stroke"
          />
        );
      })}
      {/* transparent hit area over the bbox so fills/none elements select easily */}
    </g>
  );
});
