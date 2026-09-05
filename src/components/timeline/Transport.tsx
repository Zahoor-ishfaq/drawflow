import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatTimecode } from '../../lib/time';
import { IconButton } from '../ui/IconButton';

export function Transport() {
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const { play, pause, stop, setTime } = useStore.getState();

  return (
    <div className="flex items-center gap-1">
      <IconButton label="Skip to start" onClick={() => { pause(); setTime(0); }}>
        <SkipBack size={15} />
      </IconButton>
      <IconButton label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={() => (isPlaying ? pause() : play())}>
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </IconButton>
      <IconButton label="Stop" onClick={stop}>
        <Square size={13} />
      </IconButton>
      <IconButton label="Skip to end" onClick={() => { pause(); setTime(duration); }}>
        <SkipForward size={15} />
      </IconButton>
      <span className="tabular ml-2 text-[12px] text-t2">
        <span className="text-t1">{formatTimecode(currentTime, fps)}</span>
        {' / '}
        {formatTimecode(duration, fps)}
      </span>
    </div>
  );
}
