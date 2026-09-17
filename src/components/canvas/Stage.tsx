import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useRenderContext } from '../../store/selectors';
import type { DrawElement } from '../../types';
import { elementFrameAt, FULL_FRAME, handFrameAt } from '../../lib/renderFrame';
import { cameraAt, cameraForElement, viewBoxFor, viewFromRect } from '../../lib/camera';
import { paperDef } from '../../assets/paper';
import { ElementNode } from './ElementNode';
import { Hand } from './Hand';
import { SelectionBox } from './SelectionBox';

interface Rect { x: number; y: number; width: number; height: number }

interface StageProps {
  /** edit: infinite paper filling the workspace; camera: the video frame at the current time */
  mode: 'edit' | 'camera';
  cssWidth: number;
  cssHeight: number;
  /** visible canvas rect (edit mode) */
  editView?: Rect;
  /** camera boundary in canvas coords (edit mode) */
  boundary?: Rect;
  /** pan request in canvas units (edit mode, dragging empty paper) */
  onPan: (dxCanvas: number, dyCanvas: number) => void;
}

type DragState =
  | { mode: 'move'; id: string; offsetX: number; offsetY: number }
  | { mode: 'scale'; id: string; startDist: number; startScale: number }
  | { mode: 'pan'; lastX: number; lastY: number; moved: boolean }
  | { mode: 'camMove'; id: string; offsetX: number; offsetY: number; width: number; height: number }
  | { mode: 'camResize'; id: string; anchorX: number; anchorY: number; sx: number; sy: number };

const ACCENT = '#0d9d97';
const CLICK_SLOP = 4; // px of movement below which a drag counts as a click

export function Stage({ mode, cssWidth, cssHeight, editView, boundary, onPan }: StageProps) {
  const project = useStore((s) => s.project);
  const currentTime = useStore((s) => s.currentTime);
  const isPlaying = useStore((s) => s.isPlaying);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const updateElement = useStore((s) => s.updateElement);
  const ctx = useRenderContext();
  const { ordered, timeline } = ctx;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [panning, setPanning] = useState(false);

  const cameraMode = mode === 'camera';
  const selected = ordered.find((e) => e.id === selectedId) ?? null;

  // Edit view shows the finished scribe with no hand on an endless sheet;
  // camera view is the time-based picture the video will contain.
  const vb: Rect = cameraMode
    ? viewBoxFor(cameraAt(currentTime, timeline, project), project)
    : editView ?? { x: 0, y: 0, width: project.width, height: project.height };
  const hand = cameraMode ? handFrameAt(ordered, currentTime, project, timeline) : null;
  const paper = paperDef(project.paper);
  const defs = paper.defs(project.background);
  const interactive = !isPlaying;
  const pxPerUnit = cssWidth / vb.width; // screen px per canvas unit

  // The selected element's recorded shot. Shown only when it differs from
  // the on-screen boundary — when they coincide the boundary says it all.
  const cameraGuide = useMemo(() => {
    if (!selected || cameraMode) return null;
    const idx = ordered.findIndex((e) => e.id === selected.id);
    if (idx === -1) return null;
    const r = viewBoxFor(cameraForElement(idx, ordered, project), project);
    if (boundary) {
      const tol = Math.min(boundary.width, boundary.height) * 0.03;
      const same =
        Math.abs(r.x - boundary.x) < tol && Math.abs(r.y - boundary.y) < tol &&
        Math.abs(r.width - boundary.width) < tol && Math.abs(r.height - boundary.height) < tol;
      if (same) return null;
    }
    return r;
  }, [selected, cameraMode, ordered, project, boundary]);

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
    };
  };

  const capture = (e: React.PointerEvent) => {
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onElementPointerDown = (e: React.PointerEvent, el: DrawElement) => {
    if (e.button !== 0 || isPlaying) return;
    e.stopPropagation();
    select(el.id);
    const p = toCanvasPoint(e.clientX, e.clientY);
    dragRef.current = { mode: 'move', id: el.id, offsetX: p.x - el.x, offsetY: p.y - el.y };
    capture(e);
  };

  const onHandleDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !selected) return;
    e.stopPropagation();
    const p = toCanvasPoint(e.clientX, e.clientY);
    const dist = Math.hypot(p.x - selected.x, p.y - selected.y);
    dragRef.current = { mode: 'scale', id: selected.id, startDist: Math.max(dist, 1), startScale: selected.scale };
    capture(e);
  };

  // empty paper: left-drag pans (hand cursor); a plain click deselects
  const onPaperPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isPlaying) return;
    if (cameraMode) { select(null); return; }
    dragRef.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false };
    setPanning(true);
    capture(e);
  };

  // camera frame: drag its border/label to move, a corner to resize (aspect locked)
  const onCamFrameDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !selected || !cameraGuide) return;
    e.stopPropagation();
    const p = toCanvasPoint(e.clientX, e.clientY);
    dragRef.current = {
      mode: 'camMove', id: selected.id,
      offsetX: p.x - cameraGuide.x, offsetY: p.y - cameraGuide.y,
      width: cameraGuide.width, height: cameraGuide.height,
    };
    capture(e);
  };
  const onCamCornerDown = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'se' | 'sw') => {
    if (e.button !== 0 || !selected || !cameraGuide) return;
    e.stopPropagation();
    const g = cameraGuide;
    // the opposite corner stays put
    const anchorX = corner === 'nw' || corner === 'sw' ? g.x + g.width : g.x;
    const anchorY = corner === 'nw' || corner === 'ne' ? g.y + g.height : g.y;
    dragRef.current = {
      mode: 'camResize', id: selected.id, anchorX, anchorY,
      sx: corner === 'nw' || corner === 'sw' ? -1 : 1,
      sy: corner === 'nw' || corner === 'ne' ? -1 : 1,
    };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'camMove') {
      const p = toCanvasPoint(e.clientX, e.clientY);
      const rect = { x: p.x - drag.offsetX, y: p.y - drag.offsetY, width: drag.width, height: drag.height };
      updateElement(drag.id, { camera: 'custom', customCamera: viewFromRect(rect, project) });
      return;
    }
    if (drag.mode === 'camResize') {
      const p = toCanvasPoint(e.clientX, e.clientY);
      const aspect = project.width / project.height;
      const dx = Math.max(0, (p.x - drag.anchorX) * drag.sx);
      const dy = Math.max(0, (p.y - drag.anchorY) * drag.sy);
      const width = Math.max(200, Math.max(dx, dy * aspect));
      const height = width / aspect;
      const rect = {
        x: drag.sx > 0 ? drag.anchorX : drag.anchorX - width,
        y: drag.sy > 0 ? drag.anchorY : drag.anchorY - height,
        width, height,
      };
      updateElement(drag.id, { camera: 'custom', customCamera: viewFromRect(rect, project) });
      return;
    }
    if (drag.mode === 'pan') {
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      drag.moved = true;
      onPan(dx / pxPerUnit, dy / pxPerUnit);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
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
    const drag = dragRef.current;
    if (drag?.mode === 'pan') {
      if (!drag.moved) select(null);
      setPanning(false);
    }
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const guideStroke = 1.5 / pxPerUnit;

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      preserveAspectRatio="none"
      style={{
        width: cssWidth,
        height: cssHeight,
        display: 'block',
        ...(cameraMode
          ? { borderRadius: 4, boxShadow: '0 8px 30px rgba(25, 35, 55, 0.18), 0 1px 3px rgba(25, 35, 55, 0.1)' }
          : {}),
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {defs && <defs dangerouslySetInnerHTML={{ __html: defs }} />}
      {/* paper covers whatever is visible (the canvas is infinite) */}
      <rect
        x={vb.x}
        y={vb.y}
        width={vb.width}
        height={vb.height}
        fill={paper.fill(project.background)}
        style={{ cursor: cameraMode || isPlaying ? 'default' : panning ? 'grabbing' : 'grab' }}
        onPointerDown={onPaperPointerDown}
      />

      {/* camera boundary: what the video captures from here */}
      {!cameraMode && boundary && (
        <g pointerEvents="none">
          <rect
            x={boundary.x}
            y={boundary.y}
            width={boundary.width}
            height={boundary.height}
            fill="none"
            stroke="#5b6472"
            strokeOpacity={0.7}
            strokeWidth={guideStroke}
            strokeDasharray={`${10 / pxPerUnit} ${8 / pxPerUnit}`}
          />
          <text
            x={boundary.x + 12 / pxPerUnit}
            y={boundary.y + boundary.height + 18 / pxPerUnit}
            fontSize={12 / pxPerUnit}
            fontFamily="Inter, system-ui, sans-serif"
            fill="#5b6472"
          >
            camera boundary — what the video captures
          </text>
        </g>
      )}

      {ordered.map((el) => {
        const frame = cameraMode ? elementFrameAt(el, currentTime, vb) : FULL_FRAME;
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
        <g>
          <rect
            x={cameraGuide.x}
            y={cameraGuide.y}
            width={cameraGuide.width}
            height={cameraGuide.height}
            fill="none"
            stroke={ACCENT}
            strokeOpacity={0.55}
            strokeWidth={guideStroke}
            strokeDasharray={`${8 / pxPerUnit} ${6 / pxPerUnit}`}
            rx={4 / pxPerUnit}
            pointerEvents="none"
          />
          {/* fat invisible border: drag the frame */}
          {interactive && (
            <rect
              x={cameraGuide.x}
              y={cameraGuide.y}
              width={cameraGuide.width}
              height={cameraGuide.height}
              fill="none"
              stroke="transparent"
              strokeWidth={14 / pxPerUnit}
              pointerEvents="stroke"
              style={{ cursor: 'move' }}
              onPointerDown={onCamFrameDown}
            />
          )}
          {/* label tab (also a drag handle) */}
          <g
            transform={`translate(${cameraGuide.x} ${cameraGuide.y - 22 / pxPerUnit})`}
            style={{ cursor: interactive ? 'move' : 'default' }}
            onPointerDown={interactive ? onCamFrameDown : undefined}
          >
            <rect width={190 / pxPerUnit} height={20 / pxPerUnit} rx={4 / pxPerUnit} fill={ACCENT} fillOpacity={0.9} />
            <text
              x={8 / pxPerUnit}
              y={14 / pxPerUnit}
              fontSize={11.5 / pxPerUnit}
              fontFamily="Inter, system-ui, sans-serif"
              fill="#ffffff"
              pointerEvents="none"
            >
              {selected?.camera === 'previous'
                ? "this element's shot (stays)"
                : selected?.camera === 'whole'
                  ? "this element's shot (everything)"
                  : selected?.camera === 'auto'
                    ? "this element's shot (zoomed)"
                    : "this element's shot"}
            </text>
          </g>
          {/* corner handles: resize (aspect locked) */}
          {interactive &&
            (['nw', 'ne', 'se', 'sw'] as const).map((corner) => {
              const hx = corner === 'nw' || corner === 'sw' ? cameraGuide.x : cameraGuide.x + cameraGuide.width;
              const hy = corner === 'nw' || corner === 'ne' ? cameraGuide.y : cameraGuide.y + cameraGuide.height;
              const hs = 6 / pxPerUnit;
              return (
                <rect
                  key={corner}
                  x={hx - hs}
                  y={hy - hs}
                  width={hs * 2}
                  height={hs * 2}
                  fill="#ffffff"
                  stroke={ACCENT}
                  strokeWidth={guideStroke}
                  style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                  onPointerDown={(e) => onCamCornerDown(e, corner)}
                />
              );
            })}
        </g>
      )}

      {selected && !isPlaying && (
        <SelectionBox element={selected} zoom={pxPerUnit} onHandleDown={onHandleDown} />
      )}
    </svg>
  );
}
