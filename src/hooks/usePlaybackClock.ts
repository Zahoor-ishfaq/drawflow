// One master clock drives everything (spec §6): rAF-based, audio started in
// sync at play time. The canvas re-derives what's visible from currentTime.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { startAudio, stopAudio } from '../lib/audioEngine';

export function usePlaybackClock(): void {
  const isPlaying = useStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      stopAudio();
      return;
    }
    const { currentTime, audio } = useStore.getState();
    const clockStart = performance.now();
    const offset = currentTime;
    startAudio(audio, offset);

    let raf = 0;
    const tick = (now: number) => {
      const s = useStore.getState();
      const t = offset + (now - clockStart) / 1000;
      if (t >= s.project.duration) {
        s.setTime(s.project.duration);
        s.pause();
        return;
      }
      s.setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      stopAudio();
    };
  }, [isPlaying]);
}
