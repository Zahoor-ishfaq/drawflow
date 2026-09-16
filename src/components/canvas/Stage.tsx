import { useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useRenderContext } from '../../store/selectors';
import type { DrawElement } from '../../types';
import { elementFrameAt, FULL_FRAME, handFrameAt } from '../../lib/renderFrame';
import { cameraAt, cameraForElement, viewBoxFor, wholeView } from '../../lib/camera';
import { paperDef } from '../../assets/paper';
import { ElementNode } from './ElementNode';
import { Hand } from './Hand';
import { SelectionBox } from './SelectionBox';

interface StageProps {
  zoom: number;
}

type DragState =
  | { mode: 'move'; id: string; offsetX: number; offsetY: number }
  | { mode: 'scale'; id: string; startDist: number; startScale: number };

const ACCENT = '#0d9d97';

export function Stage({ zoom }: StageProps) {
  const project = useStore((s) => s.project);
  const currentTime = useStore((s) => s.currentTime);
  const cameraView = useStore((s) => s.cameraView);
  const isPlaying = useStore((s) => s.isPlaying);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const updateElement = useStore((s) => s.updateElement);
  const ctx = useRenderContext();
  const { ordered, timeline } = ctx;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const selected = ordered.find((e) => e.id === selectedId) ?? null;
  // Edit view shows the finished scribe with no hand; camera view is the
  // time-based picture the video will contain.
  const cam = cameraView ? cameraAt(currentTime, timeline, project) : wholeView(project);
  const vb = viewBoxFor(cam, project);
  const hand = cameraView ? handFrameAt(ordered, currentTime, project, timeline) : null;
  const paper = paperDef(project.paper);
  const defs = paper.defs(project.background);
  const interactive = !isPlaying;

  // dashed guide showing what the camera will frame for the selected element
  const cameraGuide = useMemo(() => {
    if (!selected || cameraView || isPlaying) return null;
    const idx = ordered.findIndex((e) => e.id === selected.id);
    if (idx === -1) return null;
    return viewBoxFor(cameraForElement(idx, ordered, project), project);
  }, [selected, cameraView, isPlaying, ordered, project]);

  const effectiveZoom = zoom * cam.zoom;

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
    };
  };

  const onElementPointerDown = (e: React.PointerEvent, el: DrawElement) => {
    if (e.button !== 0 || isPlaying) return;
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
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      style={{
        width: project.width * zoom,
        height: project.height * zoom,
        display: 'block',
        borderRadius: 4,
        boxShadow: '0 8px 30px rgba(25, 35, 55, 0.18), 0 1px 3px rgba(25, 35, 55, 0.1)',
      }}
      onPointerDown={(e) => {
        if (e.button === 0) select(null); // click empty paper → deselect
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {defs && <defs dangerouslySetInnerHTML={{ __html: defs }} />}
      {/* paper covers whatever the camera can see (the canvas is infinite) */}
      <rect x={vb.x} y={vb.y} width={vb.width} height={vb.height} fill={paper.fill(project.background)} />

      {ordered.map((el) => {
        const frame = cameraView ? elementFrameAt(el, currentTime, vb) : FULL_FRAME;
        if (!frame) return null;
        return (
          <ElementNode
            key={el.id}
            element={el}
            frame={frame}
            interactive={interactive}
            onPointerDown={onElementPointerDown}
          />
        );
      })}

      <Hand frame={hand} />

      {cameraGuide && (
        <g pointerEvents="none">
          <rect
            x={cameraGuide.x}
            y={cameraGuide.y}
            width={cameraGuide.width}
            height={cameraGuide.height}
            fill="none"
            stroke={ACCENT}
            strokeOpacity={0.55}
            strokeWidth={1.5 / effectiveZoom}
            strokeDasharray={`${8 / effectiveZoom} ${6 / effectiveZoom}`}
            rx={4 / effectiveZoom}
          />
          <text
            x={cameraGuide.x + 12 / effectiveZoom}
            y={cameraGuide.y + 22 / effectiveZoom}
            fontSize={13 / effectiveZoom}
            fontFamily="Inter, system-ui, sans-serif"
            fill={ACCENT}
            fillOpacity={0.8}
          >
            camera
          </text>
        </g>
      )}

      {selected && !isPlaying && (
        <SelectionBox element={selected} zoom={effectiveZoom} onHandleDown={onHandleDown} />
      )}
    </svg>
  );
}
