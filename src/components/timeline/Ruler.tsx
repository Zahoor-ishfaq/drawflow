import { formatRulerLabel } from '../../lib/time';

interface RulerProps {
  duration: number;
  pxPerSec: number;
  onSeekPointerDown: (e: React.PointerEvent) => void;
}

export function Ruler({ duration, pxPerSec, onSeekPointerDown }: RulerProps) {
  const width = duration * pxPerSec;
  // adaptive intervals so labels never collide
  const labelEvery = pxPerSec >= 90 ? 1 : pxPerSec >= 40 ? 2 : pxPerSec >= 18 ? 5 : 10;
  const tickEvery = labelEvery >= 5 ? 1 : 0.5;

  const ticks: { t: number; major: boolean }[] = [];
  for (let t = 0; t <= duration + 1e-6; t += tickEvery) {
    const rounded = Math.round(t * 100) / 100;
    ticks.push({ t: rounded, major: Math.round(rounded / labelEvery) * labelEvery === rounded });
  }

  return (
    <div
      className="relative h-6 cursor-pointer border-b border-line"
      style={{ width }}
      onPointerDown={onSeekPointerDown}
    >
      <svg width={width} height={24} className="absolute inset-0">
        {ticks.map(({ t, major }) => (
          <line
            key={t}
            x1={t * pxPerSec}
            x2={t * pxPerSec}
            y1={major ? 13 : 18}
            y2={24}
            stroke="#4a4a52"
            strokeWidth={1}
          />
        ))}
      </svg>
      {ticks.filter((x) => x.major).map(({ t }) => (
        <span
          key={t}
          className="tabular pointer-events-none absolute top-0.5 text-[10px] text-t3"
          style={{ left: t * pxPerSec + 3 }}
        >
          {formatRulerLabel(t)}
        </span>
      ))}
    </div>
  );
}
