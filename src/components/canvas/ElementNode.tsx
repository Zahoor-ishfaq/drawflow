import { memo } from 'react';
import type { DrawElement } from '../../types';
import { elementInnerSvg, elementTransform, type ElementFrame } from '../../lib/renderFrame';
import { localBounds } from '../../lib/camera';

interface ElementNodeProps {
  element: DrawElement;
  frame: ElementFrame;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent, el: DrawElement) => void;
}

/**
 * One element on the live canvas. The artwork is the same markup the export
 * serializer produces, so what you see is exactly what renders.
 */
export const ElementNode = memo(function ElementNode({
  element: el,
  frame,
  interactive,
  onPointerDown,
}: ElementNodeProps) {
  const bbox = localBounds(el);
  const clickable = interactive && !el.locked;

  return (
    <g
      transform={elementTransform(el, frame)}
      opacity={frame.groupOpacity}
      onPointerDown={clickable ? (e) => onPointerDown(e, el) : undefined}
      style={{ cursor: clickable ? 'move' : 'default', pointerEvents: el.locked ? 'none' : undefined }}
    >
      {/* transparent bbox hit area so the whole element is clickable/draggable */}
      {clickable && (
        <rect
          x={bbox.x}
          y={bbox.y}
          width={Math.max(bbox.width, 1)}
          height={Math.max(bbox.height, 1)}
          fill="transparent"
          stroke="none"
        />
      )}
      <g dangerouslySetInnerHTML={{ __html: elementInnerSvg(el, frame) }} />
    </g>
  );
});
