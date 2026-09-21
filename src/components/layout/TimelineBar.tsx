import { useEffect, useRef, useState } from 'react';
import { Mic, Minus, Plus, Square } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/uiStore';
import { formatTimecode } from '../../lib/time';
import { startRecording, stopRecording, useRecorder } from '../../lib/recorder';
import { Transport } from '../timeline/Transport';
import { TimeRuler } from '../timeline/TimeRuler';
import { ElementTrack } from '../timeline/ElementTrack';
import { AudioLanes, LANES } from '../timeline/AudioLane';
import { FilmStrip } from '../timeline/FilmStrip';
import type { AudioLaneKind } from '../../types';

const MIN_ZOOM = 1;
const MAX_ZOOM = 40;
const MIN_HEIGHT = 230;
/** the workspace above keeps at least this much room */
const MIN_WORKSPACE = 300;

export function TimelineBar() {
  const currentTime = useStore((s) => s.currentTime);
  const isPlaying = useStore((s) => s.isPlaying);
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const clips = useStore((s) => s.audioClips);
  const zoom = useUiStore((s) => s.timelineZoom);
  const laneFlags = useUiStore((s) => s.lanes);
  const setUi = useUiStore((s) => s.set);
  const timelineHeight = useUiStore((s) => s.timelineHeight);
  const rec = useRecorder();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const resizing = useRef<{ startY: number; startH: number } | null>(null);

  // a lane shows when it has clips, is switched on, or is recording
  const visibleLanes = LANES.filter((l) => laneFlags[l.kind] || clips.some((c) => c.lane === l.kind) || (l.kind === 'voice' && rec.active));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    setViewWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const contentWidth = Math.max(0, viewWidth * zoom);
  const pxPerSec = duration > 0 ? contentWidth / duration : 0;

  // Ctrl+wheel zooms around the cursor; plain wheel scrolls sideways
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && zoom > 1) { e.preventDefault(); el.scrollLeft += e.deltaY; }
        return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const t = pxPerSec > 0 ? x / pxPerSec : 0;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-e.deltaY * 0.002)));
      setUi({ timelineZoom: next });
      requestAnimationFrame(() => {
        const nextPx = (viewWidth * next) / Math.max(duration, 1e-6);
        el.scrollLeft = t * nextPx - (e.clientX - rect.left);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, pxPerSec, viewWidth, duration, setUi]);

  // keep the playhead in view while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isPlaying || zoom <= 1) return;
    const x = currentTime * pxPerSec;
    if (x < el.scrollLeft + 20 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [currentTime, isPlaying, pxPerSec, zoom]);

  const zoomTo = (z: number) => setUi({ timelineZoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) });

  // drag the top edge to resize the timeline; the workspace keeps room
  const maxHeight = () => Math.max(MIN_HEIGHT, window.innerHeight - 52 - MIN_WORKSPACE);
  const onResizeDown = (e: React.PointerEvent) => {
    resizing.current = { startY: e.clientY, startH: timelineHeight || (e.currentTarget.parentElement?.clientHeight ?? 300) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizing.current;
    if (!r) return;
    setUi({ timelineHeight: Math.max(MIN_HEIGHT, Math.min(maxHeight(), r.startH - (e.clientY - r.startY))) });
  };
  const onResizeUp = () => { resizing.current = null; };
  useEffect(() => {
    const onWin = () => { if (timelineHeight > maxHeight()) setUi({ timelineHeight: maxHeight() }); };
    window.addEventListener('resize', onWin);
    onWin();
    return () => window.removeEventListener('resize', onWin);
  }, [timelineHeight, setUi]);

  const toggleLane = (kind: AudioLaneKind) => setUi({ lanes: { ...laneFlags, [kind]: !laneFlags[kind] } });

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-line bg-panel"
      style={timelineHeight ? { height: timelineHeight } : undefined}
    >
      <div
        className="absolute -top-1 right-0 left-0 z-20 h-2 cursor-ns-resize"
        title="Drag to resize the timeline"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
      <div className="flex min-h-0 flex-1 gap-3 px-4 pt-2 pb-1">
        {/* left column: transport */}
        <div className="flex w-[120px] shrink-0 flex-col items-center pt-7" data-tour="transport">
          <Transport />
        </div>
        {/* middle column: every time-based thing shares this left edge */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-w-0 overflow-x-auto overflow-y-hidden pb-1">
            {viewWidth > 0 && (
              <div className="flex flex-col gap-1" style={{ width: contentWidth }}>
                <div data-tour="ruler"><TimeRuler pxPerSec={pxPerSec} width={contentWidth} /></div>
                <div data-tour="element-track"><ElementTrack pxPerSec={pxPerSec} width={contentWidth} /></div>
                <div data-tour="lanes"><AudioLanes pxPerSec={pxPerSec} width={contentWidth} lanes={visibleLanes.map((l) => l.kind)} /></div>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1" data-tour="filmstrip">
            <FilmStrip />
          </div>
        </div>
        {/* right column: timecode, zoom, lane toggles, record */}
        <div className="flex w-[150px] shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="tabular h-6 text-right text-[12.5px] text-t2">
            <span className="font-medium text-t1">{formatTimecode(currentTime, fps)}</span>
            <span className="mx-1 text-t3">/</span>
            {formatTimecode(duration, fps)}
          </span>
          <div className="flex h-9 items-center gap-0.5 rounded-full border border-line px-1" data-tour="timeline-zoom">
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1" onClick={() => zoomTo(zoom / 1.5)} title="Zoom out timeline" aria-label="Zoom out timeline">
              <Minus size={12} />
            </button>
            <button type="button" className="tabular min-w-9 text-center text-[11px] text-t2 hover:text-t1" onClick={() => zoomTo(1)} title="Fit the whole timeline">
              {zoom <= 1.01 ? 'fit' : `${zoom.toFixed(1)}×`}
            </button>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-t2 hover:bg-hov hover:text-t1" onClick={() => zoomTo(zoom * 1.5)} title="Zoom in timeline (Ctrl+wheel)" aria-label="Zoom in timeline">
              <Plus size={12} />
            </button>
          </div>
          {/* one row per visible lane, aligned with it */}
          {visibleLanes.map((l) => (
            <div key={l.kind} className="flex h-10 w-full items-center justify-end gap-1.5">
              {l.kind === 'voice' ? (
                <button
                  type="button"
                  className={
                    'df-ui-anim flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium text-white transition-all ' +
                    (rec.active ? 'bg-[#d9414f] hover:brightness-105' : 'bg-[#e05a6d] hover:brightness-105')
                  }
                  title={rec.active ? 'Stop recording' : 'Record a voiceover while the scribe plays from the playhead'}
                  data-tour="record"
                  onClick={() => (rec.active ? stopRecording() : void startRecording())}
                >
                  {rec.active ? <Square size={11} /> : <Mic size={12} />}
                  {rec.active ? 'Stop' : 'Record'}
                </button>
              ) : (
                <span className="text-[10.5px] text-t3">{l.label}</span>
              )}
            </div>
          ))}
          {/* lane switches */}
          <div className="mt-1 flex flex-col items-end gap-0.5 text-[10.5px] text-t3" data-tour="lane-switches">
            <span className="text-[9.5px] uppercase tracking-wide">Lanes</span>
            {LANES.map((l) => {
              const forced = clips.some((c) => c.lane === l.kind);
              return (
                <label key={l.kind} className={'flex cursor-pointer items-center gap-1.5 ' + (forced ? 'opacity-70' : '')} title={forced ? 'Has clips — always shown' : `Show the ${l.label} lane`}>
                  <span className="capitalize">{l.label}</span>
                  <input type="checkbox" className="h-3 w-3" checked={laneFlags[l.kind] || forced} disabled={forced} onChange={() => toggleLane(l.kind)} />
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
