import { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useElementsByZ } from '../../store/selectors';
import type { DrawElement } from '../../types';
import { handFrameAt } from '../../lib/renderFrame';
import { ElementNode } from './ElementNode';
import { Hand } from './Hand';
import { SelectionBox } from './SelectionBox';

interface StageProps {
  zoom: number;
}

type DragState =
  | { mode: 'move'; id: string; offsetX: number; offsetY: number }
  | { mode: 'scale'; id: string; startDist: number; startScale: number };

export function Stage({ zoom }: StageProps) {
  const project = useStore((s) => s.project);
  const currentTime = useStore((s) => s.currentTime);
  const handStyle = useStore((s) => s.handStyle);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const updateElement = useStore((s) => s.updateElement);
  const elements = useElementsByZ();

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const hand = handFrameAt(elements, currentTime);

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * project.width,
      y: ((clientY - rect.top) / rect.height) * project.height,
    };
  };

  const onElementPointerDown = (e: React.PointerEvent, el: DrawElement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(el.id);
    const p = toCanvasPoint(e.clientX, e.clientY);
    dragRef.current = { mode: 'move', id: el.id, offsetX: p.x - el.x, offsetY: p.y - el.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onHandleDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !selected) return;
    e.stopPropagation();
    const p = toCanvasPoint(e.clientX, e.clientY);
    const dist = Math.hypot(p.x - selected.x, p.y - selected.y);
    dragRef.current = {
      mode: 'scale',
      id: selected.id,
      startDist: Math.max(dist, 1),
      startScale: selected.scale,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toCanvasPoint(e.clientX, e.clientY);
    if (drag.mode === 'move') {
      updateElement(drag.id, { x: p.x - drag.offsetX, y: p.y - drag.offsetY });
    } else {
      const el = useStore.getState().elements.find((el) => el.id === drag.id);
      if (!el) return;
      const dist = Math.hypot(p.x - el.x, p.y - el.y);
      const next = drag.startScale * (dist / drag.startDist);
      updateElement(drag.id, { scale: Math.max(0.02, Math.min(next, 50)) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${project.width} ${project.height}`}
      style={{
        width: project.width * zoom,
        height: project.height * zoom,
        display: 'block',
        background: project.background,
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}
      onPointerDown={(e) => {
        if (e.button === 0) select(null); // click empty canvas → deselect
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {elements.map((el) => (
        <ElementNode
          key={el.id}
          element={el}
          currentTime={currentTime}
          onPointerDown={onElementPointerDown}
        />
      ))}
      <Hand frame={hand} style={handStyle} project={project} />
      {selected && (
        <SelectionBox element={selected} zoom={zoom} onHandleDown={onHandleDown} />
      )}
    </svg>
  );
}
