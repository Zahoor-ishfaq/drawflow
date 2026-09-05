import { useEffect, useRef } from 'react';
import { Music, Trash2 } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { useStore } from '../../store/useStore';
import { decodeAudioFile, setAudioVolume } from '../../lib/audioEngine';
import { IconButton } from '../ui/IconButton';

interface AudioLaneProps {
  pxPerSec: number;
  tFromClientX: (clientX: number) => number;
}

export function AudioLane({ pxPerSec, tFromClientX }: AudioLaneProps) {
  const audio = useStore((s) => s.audio);
  const { setAudio, updateAudio } = useStore.getState();
  const waveRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null); // grab offset in seconds

  useEffect(() => {
    if (!audio || !waveRef.current) return;
    const ws = WaveSurfer.create({
      container: waveRef.current,
      url: audio.url,
      height: 40,
      waveColor: '#5f6a80',
      progressColor: '#5f6a80',
      cursorWidth: 0,
      interact: false,
      normalize: true,
    });
    ws.setMuted(true); // playback goes through Web Audio, wavesurfer only draws
    return () => ws.destroy();
  }, [audio?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buffer = await decodeAudioFile(file);
      setAudio({
        id: crypto.randomUUID(),
        name: file.name,
        buffer,
        url: URL.createObjectURL(file),
        startTime: 0,
        volume: 1,
      });
    } catch {
      alert('Could not decode this audio file.');
    }
  };

  if (!audio) {
    return (
      <label className="mx-2 my-2 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-line text-[12px] text-t3 hover:border-[#4a4a52] hover:text-t2">
        <Music size={13} />
        Add a soundtrack (MP3, WAV…)
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
    );
  }

  const width = (audio.buffer?.duration ?? 0) * pxPerSec;

  return (
    <div className="relative h-13" style={{ height: 52 }}>
      <div
        className="absolute top-1.5 cursor-grab overflow-hidden rounded-[4px] border border-[#3d4a63] bg-[#2a3040]"
        style={{ left: audio.startTime * pxPerSec, width: Math.max(width, 20), height: 40 }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragRef.current = tFromClientX(e.clientX) - audio.startTime;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragRef.current === null) return;
          updateAudio({ startTime: Math.max(0, tFromClientX(e.clientX) - dragRef.current) });
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
        }}
      >
        <div ref={waveRef} className="pointer-events-none h-full" />
      </div>
    </div>
  );
}

/** Label-column cell for the audio lane: name, volume, remove. */
export function AudioLaneLabel() {
  const audio = useStore((s) => s.audio);
  const { setAudio, updateAudio } = useStore.getState();
  if (!audio) {
    return (
      <div className="flex items-center gap-1.5 px-2 text-[11px] text-t3">
        <Music size={12} /> Audio
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-center gap-1 px-2" style={{ height: 52 }}>
      <div className="flex items-center gap-1">
        <Music size={11} className="shrink-0 text-t3" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-t2">{audio.name}</span>
        <IconButton
          label="Remove audio"
          className="!h-5 !w-5"
          onClick={() => {
            URL.revokeObjectURL(audio.url);
            setAudio(null);
          }}
        >
          <Trash2 size={11} />
        </IconButton>
      </div>
      <input
        type="range"
        className="df-slider"
        min={0}
        max={1}
        step={0.01}
        value={audio.volume}
        style={{ '--fill': `${audio.volume * 100}%` } as React.CSSProperties}
        title="Volume"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          updateAudio({ volume: v });
          setAudioVolume(v);
        }}
      />
    </div>
  );
}
