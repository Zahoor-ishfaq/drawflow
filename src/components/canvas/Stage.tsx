import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useRenderContext } from '../../store/selectors';
import { snap, useUiStore } from '../../store/uiStore';
import type { DrawElement } from '../../types';
import {
  elementFrameAt, FULL_FRAME, handFrameAt, paperAt, sceneOverlayAt, visibleAt,
} from '../../lib/renderFrame';
import { cameraAt, cameraForElement, elementBounds, viewBoxFor } from '../../lib/camera';
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
  | { mode: 'move'; items: { id: string; offsetX: number; offsetY: number }[]; moved: boolean }
  | { mode: 'scale'; id: string; startDist: number; startScale: number }
  | { mode: 'rotate'; id: string; startAngle: number; startRotation: number }
  | { mode: 'pan'; lastX: number; lastY: number; moved: boolean }
  | { mode: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean };

const ACCENT = '#0d9d97';
const CLICK_SLOP = 4; // px of movement below which a drag counts as a click
const GUIDE_SNAP_PX = 6;

export function Stage({ mode, cssWidth, cssHeight, editView, boundary, onPan }: StageProps) {
  const project = useStore((s) => s.project);
  const currentTime = useStore((s) => s.currentTime);
  const isPlaying = useStore((s) => s.isPlaying);
  const selectedId = useStore((s) => s.selectedId);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const selectMany = useStore((s) => s.selectMany);
  const updateElement = useStore((s) => s.updateElement);
  const updateElements = useStore((s) => s.updateElements);
  const showGuides = useUiStore((s) => s.showGuides);
  const lowQuality = useUiStore((s) => s.lowQualityPreview);
  const ctx = useRenderContext();
  const { ordered, timeline } = ctx;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});

  const cameraMode = mode === 'camera';
  const selected = ordered.find((e) => e.id === selectedId) ?? null;
  const selectedEls = useMemo(
    () => selectedIds.map((id) => ordered.find((e) => e.id === id)).filter((e): e is DrawElement => !!e),
    [selectedIds, ordered],
  );

  // Edit view shows the finished scribe with no hand on an endless sheet;
  // camera view is the time-based picture the video will contain.
  const vb: Rect = cameraMode
    ? viewBoxFor(cameraAt(currentTime, timeline, project), project)
    : editView ?? { x: 0, y: 0, width: project.width, height: project.height };
  const hand = cameraMode ? handFrameAt(ordered, currentTime, project, timeline) : null;
  const { paper: paperId, background } = cameraMode ? paperAt(ctx, currentTime) : project;
  const paper = paperDef(paperId);
  const defs = paper.defs(background);
  const interactive = !isPlaying;
  const pxPerUnit = cssWidth / vb.width; // screen px per canvas unit
  const overlay = cameraMode ? sceneOverlayAt(currentTime, ctx.scenes) : null;
  const drawn = cameraMode ? visibleAt(ctx, currentTime) : ctx.stacked;

  // Where the camera will be while the selected element draws. Shown (as a
  // passive outline under the artwork) only when it differs from the
  // on-screen boundary — when they coincide the boundary says it all.
  const cameraGuide = useMemo(() => {
    if (!selected || cameraMode || selectedIds.length !== 1) return null;
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
  }, [selected, selectedIds.length, cameraMode, ordered, project, boundary]);

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
    if (e.button !== 0 || isPlaying || el.locked) return;
    e.stopPropagation();
    let ids: string[];
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(el.id);
      ids = selectedIds.includes(el.id) ? selectedIds.filter((x) => x !== el.id) : [...selectedIds, el.id];
    } else if (selectedIds.includes(el.id)) {
      ids = selectedIds;
      if (selectedId !== el.id) selectMany([...selectedIds.filter((x) => x !== el.id), el.id]);
    } else {
      select(el.id);
      ids = [el.id];
    }
    const p = toCanvasPoint(e.clientX, e.clientY);
    const all = useStore.getState().elements;
    const items = ids
      .map((id) => all.find((x) => x.id === id))
      .filter((x): x is DrawElement => !!x && !x.locked)
      .map((x) => ({ id: x.id, offsetX: p.x - x.x, offsetY: p.y - x.y }));
    dragRef.current = { mode: 'move', items, moved: false };
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

  const onRotateDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !selected) return;
    e.stopPropagation();
    const p = toCanvasPoint(e.clientX, e.clientY);
    const a = (Math.atan2(p.y - selected.y, p.x - selected.x) * 180) / Math.PI;
    dragRef.current = { mode: 'rotate', id: selected.id, startAngle: a, startRotation: selected.rotation };
    capture(e);
  };

  // empty paper: left-drag pans (hand cursor); shift-drag draws a marquee; a plain click deselects
  const onPaperPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isPlaying) return;
    if (cameraMode) { select(null); return; }
    if (e.shiftKey) {
      const p = toCanvasPoint(e.clientX, e.clientY);
      dragRef.current = { mode: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: true };
      capture(e);
      return;
    }
    dragRef.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false };
    setPanning(true);
    capture(e);
  };

  /** Smart guides: pull a single moving element onto other elements' edges/centres. */
  const guideSnap = (el: DrawElement, x: number, y: number): { x: number; y: number; gx?: number; gy?: number } => {
    if (!showGuides || cameraMode) return { x, y };
    const tol = GUIDE_SNAP_PX / pxPerUnit;
    const b = elementBounds({ ...el, x, y });
    const mine = { xs: [b.x, b.x + b.width / 2, b.x + b.width], ys: [b.y, b.y + b.height / 2, b.y + b.height] };
    let best: { dx: number; dy: number; gx?: number; gy?: number } = { dx: 0, dy: 0 };
    let bx = tol, by = tol;
    const others = ordered.filter((o) => o.id !== el.id && !selectedIds.includes(o.id));
    const targets = others.map((o) => elementBounds(o));
    // the video frame edges count too
    targets.push({ x: 0, y: 0, width: project.width, height: project.height });
    for (const o of targets) {
      const oxs = [o.x, o.x + o.width / 2, o.x + o.width];
      const oys = [o.y, o.y + o.height / 2, o.y + o.height];
      for (const mx of mine.xs) for (const ox of oxs) {
        const d = Math.abs(mx - ox);
        if (d < bx) { bx = d; best = { ...best, dx: ox - mx, gx: ox }; }
      }
      for (const my of mine.ys) for (const oy of oys) {
        const d = Math.abs(my - oy);
        if (d < by) { by = d; best = { ...best, dy: oy - my, gy: oy }; }
      }
    }
    return { x: x + best.dx, y: y + best.dy, gx: best.gx, gy: best.gy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
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
    if (drag.mode === 'marquee') {
      const p = toCanvasPoint(e.clientX, e.clientY);
      drag.x1 = p.x; drag.y1 = p.y;
      setMarquee({
        x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0),
      });
      return;
    }
    const p = toCanvasPoint(e.clientX, e.clientY);
    if (drag.mode === 'move') {
      drag.moved = true;
      if (drag.items.length === 1) {
        const it = drag.items[0];
        const el = useStore.getState().elements.find((x) => x.id === it.id);
        if (!el) return;
        let x = snap(p.x - it.offsetX), y = snap(p.y - it.offsetY);
        const g = guideSnap(el, x, y);
        x = g.x; y = g.y;
        setGuides({ x: g.gx, y: g.gy });
        updateElement(it.id, { x, y });
      } else {
        const lead = drag.items[0];
        const dx = snap(p.x - lead.offsetX) - (p.x - lead.offsetX);
        const dy = snap(p.y - lead.offsetY) - (p.y - lead.offsetY);
        const pos = new Map(drag.items.map((it) => [it.id, { x: p.x - it.offsetX + dx, y: p.y - it.offsetY + dy }]));
        updateElements([...pos.keys()], (el) => pos.get(el.id)!);
      }
    } else if (drag.mode === 'scale') {
      const el = useStore.getState().elements.find((el) => el.id === drag.id);
      if (!el) return;
      const dist = Math.hypot(p.x - el.x, p.y - el.y);
      const next = drag.startScale * (dist / drag.startDist);
      updateElement(drag.id, { scale: Math.max(0.02, Math.min(next, 50)) });
    } else if (drag.mode === 'rotate') {
      const el = useStore.getState().elements.find((el) => el.id === drag.id);
      if (!el) return;
      const a = (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI;
      let rot = drag.startRotation + (a - drag.startAngle);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = ((rot + 180) % 360 + 360) % 360 - 180;
      updateElement(drag.id, { rotation: Math.round(rot * 10) / 10 });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.mode === 'pan') {
      if (!drag.moved) select(null);
      setPanning(false);
    }
    if (drag?.mode === 'marquee') {
      const r = {
        x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0),
      };
      const hit = ordered.filter((el) => {
        if (el.locked) return false;
        const b = elementBounds(el);
        return b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y;
      }).map((el) => el.id);
      selectMany(drag.additive ? Array.from(new Set([...selectedIds, ...hit])) : hit);
      setMarquee(null);
    }
    setGuides({});
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const guideStroke = 1.5 / pxPerUnit;

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      preserveAspectRatio="none"
      shapeRendering={lowQuality && isPlaying ? 'optimizeSpeed' : undefined}
      className={lowQuality && isPlaying ? 'df-lowq' : undefined}
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
        fill={paper.fill(background)}
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

      {/* the selected element's shot: an outline only — the Inspector's Camera section moves it */}
      {cameraGuide && (
        <g pointerEvents="none">
          <rect
            x={cameraGuide.x}
            y={cameraGuide.y}
            width={cameraGuide.width}
            height={cameraGuide.height}
            fill={ACCENT}
            fillOpacity={0.035}
            stroke={ACCENT}
            strokeOpacity={0.6}
            strokeWidth={guideStroke}
            strokeDasharray={`${8 / pxPerUnit} ${6 / pxPerUnit}`}
            rx={4 / pxPerUnit}
          />
          <text
            x={cameraGuide.x + 12 / pxPerUnit}
            y={cameraGuide.y + cameraGuide.height - 10 / pxPerUnit}
            fontSize={11.5 / pxPerUnit}
            fontFamily="Inter, system-ui, sans-serif"
            fill={ACCENT}
            fillOpacity={0.9}
          >
            {selected?.camera === 'previous'
              ? 'camera while this draws (unchanged from the previous element)'
              : selected?.camera === 'whole'
                ? 'camera while this draws (everything)'
                : selected?.camera === 'scene'
                  ? 'camera while this draws (the scene)'
                  : selected?.camera === 'auto'
                    ? 'camera while this draws (zoomed in)'
                    : 'camera while this draws'}
          </text>
        </g>
      )}

      {drawn.map((el) => {
        const frame = cameraMode ? elementFrameAt(el, currentTime, vb) : FULL_FRAME;
        if (!frame) return null;
        return (
          <ElementNode
            key={el.id}
            element={el}
            frame={frame}
            interactive={interactive && !cameraMode}
            onPointerDown={onElementPointerDown}
          />
        );
      })}

      <Hand frame={hand} />

      {overlay && overlay.amount > 0 && (
        overlay.kind === 'fade' ? (
          <rect x={vb.x} y={vb.y} width={vb.width} height={vb.height} fill={overlay.color ?? background} opacity={overlay.amount} pointerEvents="none" />
        ) : (
          <rect x={vb.x + vb.width * (overlay.amount * 2 - 1)} y={vb.y} width={vb.width} height={vb.height} fill={overlay.color ?? background} pointerEvents="none" />
        )
      )}

      {/* smart guides */}
      {guides.x !== undefined && (
        <line x1={guides.x} y1={vb.y} x2={guides.x} y2={vb.y + vb.height} stroke="#ff4d8d" strokeWidth={1 / pxPerUnit} pointerEvents="none" />
      )}
      {guides.y !== undefined && (
        <line x1={vb.x} y1={guides.y} x2={vb.x + vb.width} y2={guides.y} stroke="#ff4d8d" strokeWidth={1 / pxPerUnit} pointerEvents="none" />
      )}


      {!isPlaying && !cameraMode && selectedEls.map((el) => (
        <SelectionBox
          key={el.id}
          element={el}
          zoom={pxPerUnit}
          handles={selectedEls.length === 1}
          locked={el.locked}
          onHandleDown={onHandleDown}
          onRotateDown={onRotateDown}
        />
      ))}

      {marquee && (
        <rect
          x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
          fill={ACCENT} fillOpacity={0.08} stroke={ACCENT} strokeWidth={1 / pxPerUnit}
          strokeDasharray={`${4 / pxPerUnit} ${3 / pxPerUnit}`} pointerEvents="none"
        />
      )}
    </svg>
  );
}
