import { memo } from 'react';
import type { DrawElement } from '../../types';
import { elementInnerSvg, elementTransform, pathColors, type ElementFrame } from '../../lib/renderFrame';
import { measurePaths } from '../../lib/drawing';

interface ElementNodeProps {
  element: DrawElement;
  frame: ElementFrame;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent, el: DrawElement) => void;
}

export const ElementNode = memo(function ElementNode({
  element: el,
  frame,
  interactive,
  onPointerDown,
}: ElementNodeProps) {
  const bbox = measurePaths(el.paths).bbox;
  const isImage = el.kind === 'image' && !!el.image;

  return (
    <g
      transform={elementTransform(el, frame)}
      opacity={frame.groupOpacity}
      onPointerDown={interactive ? (e) => onPointerDown(e, el) : undefined}
      style={{ cursor: interactive ? 'move' : 'default' }}
    >
      {/* transparent bbox hit area so the whole element is clickable/draggable */}
      {interactive && (
        <rect
          x={bbox.x}
          y={bbox.y}
          width={Math.max(bbox.width, 1)}
          height={Math.max(bbox.height, 1)}
          fill="transparent"
          stroke="none"
        />
      )}
      {isImage ? (
        <g dangerouslySetInnerHTML={{ __html: elementInnerSvg(el, frame) }} />
      ) : (
        el.paths.map((d, i) => {
          const dash = frame.dashes?.[i];
          const { fill, stroke } = pathColors(el, i);
          return (
            <path
              key={i}
              d={d}
              fill={fill}
              fillOpacity={frame.fillOpacity}
              fillRule={el.fillRule ?? 'nonzero'}
              stroke={stroke}
              strokeWidth={el.strokeWidth / el.scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash?.strokeDasharray}
              strokeDashoffset={dash?.strokeDashoffset}
            />
          );
        })
      )}
    </g>
  );
});
