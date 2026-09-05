import { useStore } from '../../store/useStore';

interface PlayheadProps {
  labelWidth: number;
  pxPerSec: number;
  onPointerDown: (e: React.PointerEvent) => void;
}

export function Playhead({ labelWidth, pxPerSec, onPointerDown }: PlayheadProps) {
  const currentTime = useStore((s) => s.currentTime);
  const x = labelWidth + currentTime * pxPerSec;
  return (
    <div
      className="absolute top-0 bottom-0 z-[25]"
      style={{ left: x - 5, width: 10, cursor: 'ew-resize' }}
      onPointerDown={onPointerDown}
    >
      <div className="absolute top-0 bottom-0 left-[4.5px] w-px bg-accent" />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '7px solid var(--color-accent)',
        }}
      />
    </div>
  );
}
