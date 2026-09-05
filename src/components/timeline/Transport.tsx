import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';

export function Transport() {
  const isPlaying = useStore((s) => s.isPlaying);
  const duration = useStore((s) => s.project.duration);
  const { play, pause, setTime } = useStore.getState();

  return (
    <div className="flex items-center gap-1">
      <IconButton label="Skip to start" onClick={() => { pause(); setTime(0); }}>
        <SkipBack size={16} />
      </IconButton>
      <button
        type="button"
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="df-ui-anim mx-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-[0_2px_10px_rgba(13,157,151,0.4)] transition-all hover:brightness-105 active:scale-95"
        onClick={() => (isPlaying ? pause() : play())}
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
      </button>
      <IconButton label="Skip to end" onClick={() => { pause(); setTime(duration); }}>
        <SkipForward size={16} />
      </IconButton>
    </div>
  );
}
