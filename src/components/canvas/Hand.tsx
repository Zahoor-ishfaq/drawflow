import { useMemo } from 'react';
import { handTransform, type HandFrame } from '../../lib/renderFrame';
import { handInnerSvg } from '../../assets/hands';

export function Hand({ frame }: { frame: HandFrame | null }) {
  const inner = useMemo(
    () => (frame ? handInnerSvg(frame.def, frame.def.src) : ''),
    [frame?.def],
  );
  if (!frame) return null;
  return (
    <g
      transform={handTransform(frame)}
      pointerEvents="none"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
