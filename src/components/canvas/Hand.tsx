import type { HandStyle, Project } from '../../types';
import { HAND_ARTWORK, handScaleFor } from '../../assets/hands';
import type { HandFrame } from '../../lib/renderFrame';

interface HandProps {
  frame: HandFrame | null;
  style: HandStyle;
  project: Project;
}

export function Hand({ frame, style, project }: HandProps) {
  if (!frame || style === 'none') return null;
  const s = handScaleFor(project);
  return (
    <g
      transform={`translate(${frame.x} ${frame.y}) rotate(${frame.angle}) scale(${s})`}
      pointerEvents="none"
    >
      {HAND_ARTWORK[style].map((part, i) => (
        <path
          key={i}
          d={part.d}
          fill={part.fill}
          stroke={part.stroke}
          strokeWidth={part.sw}
          transform={part.t}
        />
      ))}
    </g>
  );
}
