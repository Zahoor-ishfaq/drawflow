import { Music } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatTimecode } from '../../lib/time';
import { Transport } from '../timeline/Transport';
import { ScrubBar } from '../timeline/ScrubBar';
import { FilmStrip } from '../timeline/FilmStrip';

export function TimelineBar() {
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const audio = useStore((s) => s.audio);

  return (
    <div className="shrink-0 border-t border-line bg-panel">
      <div className="flex items-center gap-4 px-4 pt-2 pb-1">
        <Transport />
        <ScrubBar />
        <span className="tabular shrink-0 text-[12.5px] text-t2">
          <span className="font-medium text-t1">{formatTimecode(currentTime, fps)}</span>
          <span className="mx-1 text-t3">/</span>
          {formatTimecode(duration, fps)}
        </span>
        {audio && (
          <span
            className="flex max-w-40 shrink-0 items-center gap-1.5 rounded-full bg-accent-weak py-1 pr-3 pl-2 text-[11.5px] text-accent"
            title={`Soundtrack: ${audio.name}`}
          >
            <Music size={12} className="shrink-0" />
            <span className="truncate">{audio.name}</span>
          </span>
        )}
      </div>
      <div className="px-3 pb-1.5">
        <FilmStrip />
      </div>
    </div>
  );
}
