import { useStore } from '../../store/useStore';
import { formatTimecode } from '../../lib/time';
import { Transport } from '../timeline/Transport';
import { ScrubBar } from '../timeline/ScrubBar';
import { FilmStrip } from '../timeline/FilmStrip';
import { AudioLanes } from '../timeline/AudioLane';

export function TimelineBar() {
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);

  return (
    <div className="shrink-0 border-t border-line bg-panel">
      <div className="flex items-start gap-4 px-4 pt-2 pb-1">
        <div className="flex h-11 shrink-0 items-center">
          <Transport />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <ScrubBar />
            <span className="tabular w-[132px] shrink-0 text-right text-[12.5px] text-t2">
              <span className="font-medium text-t1">{formatTimecode(currentTime, fps)}</span>
              <span className="mx-1 text-t3">/</span>
              {formatTimecode(duration, fps)}
            </span>
          </div>
          <AudioLanes />
        </div>
      </div>
      <div className="px-3 pb-1.5">
        <FilmStrip />
      </div>
    </div>
  );
}
