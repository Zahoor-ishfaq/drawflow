import { useCallback, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTrackOrder } from '../../store/selectors';
import { clamp } from '../../lib/time';
import { IconButton } from '../ui/IconButton';
import { Transport } from '../timeline/Transport';
import { Ruler } from '../timeline/Ruler';
import { Track } from '../timeline/Track';
import { Playhead } from '../timeline/Playhead';
import { AudioLane, AudioLaneLabel } from '../timeline/AudioLane';

const LABEL_WIDTH = 160;

export function Timeline() {
  const duration = useStore((s) => s.project.duration);
  const tracks = useTrackOrder();
  const [pxPerSec, setPxPerSec] = useState(60);
  const originRef = useRef<HTMLDivElement>(null);

  const contentWidth = Math.ceil(duration * pxPerSec) + 40;

  const tFromClientX = useCallback(
    (clientX: number) => {
      const origin = originRef.current?.getBoundingClientRect();
      if (!origin) return 0;
      return (clientX - origin.left) / pxPerSec;
    },
    [pxPerSec],
  );

  // click/drag-to-seek shared by the ruler and the playhead
  const onSeekPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = useStore.getState();
    s.pause();
    s.setTime(tFromClientX(e.clientX));
    const onMove = (ev: PointerEvent) => useStore.getState().setTime(tFromClientX(ev.clientX));
    const onUp = () => window.removeEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return (
    <div className="flex shrink-0 flex-col border-t border-line bg-panel" style={{ height: 208 }}>
      {/* transport row */}
      <div className="grid h-9 shrink-0 grid-cols-3 items-center border-b border-line px-2">
        <div className="flex items-center gap-0.5">
          <IconButton label="Zoom timeline out" onClick={() => setPxPerSec((v) => clamp(v / 1.4, 12, 320))}>
            <ZoomOut size={14} />
          </IconButton>
          <IconButton label="Zoom timeline in" onClick={() => setPxPerSec((v) => clamp(v * 1.4, 12, 320))}>
            <ZoomIn size={14} />
          </IconButton>
        </div>
        <div className="flex justify-center"><Transport /></div>
        <div />
      </div>

      {/* tracks area */}
      <div className="relative flex-1 overflow-auto">
        <div className="relative min-h-full w-max min-w-full">
          {/* ruler row */}
          <div className="sticky top-0 z-40 flex bg-panel">
            <div
              className="sticky left-0 z-30 h-6 shrink-0 border-r border-b border-line bg-panel"
              style={{ width: LABEL_WIDTH }}
            />
            <div ref={originRef} style={{ width: contentWidth }}>
              <Ruler duration={duration} pxPerSec={pxPerSec} onSeekPointerDown={onSeekPointerDown} />
            </div>
          </div>

          {tracks.map((el, i) => (
            <Track
              key={el.id}
              element={el}
              rowIndex={i}
              rowCount={tracks.length}
              pxPerSec={pxPerSec}
              contentWidth={contentWidth}
              labelWidth={LABEL_WIDTH}
              tFromClientX={tFromClientX}
            />
          ))}

          {tracks.length === 0 && (
            <div className="flex">
              <div
                className="sticky left-0 z-30 h-7 shrink-0 border-r border-b border-line bg-panel"
                style={{ width: LABEL_WIDTH }}
              />
              <div className="flex h-7 items-center px-3 text-[11px] text-t3">
                Elements you add appear here as clips
              </div>
            </div>
          )}

          {/* audio lane */}
          <div className="flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-line bg-panel"
              style={{ width: LABEL_WIDTH }}
            >
              <AudioLaneLabel />
            </div>
            <div className="relative" style={{ width: contentWidth }}>
              <AudioLane pxPerSec={pxPerSec} tFromClientX={tFromClientX} />
            </div>
          </div>

          <Playhead labelWidth={LABEL_WIDTH} pxPerSec={pxPerSec} onPointerDown={onSeekPointerDown} />
        </div>
      </div>
    </div>
  );
}
