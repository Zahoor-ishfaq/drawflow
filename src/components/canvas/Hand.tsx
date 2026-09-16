import { handTransform, type HandFrame } from '../../lib/renderFrame';

export function Hand({ frame }: { frame: HandFrame | null }) {
  if (!frame) return null;
  return (
    <image
      href={frame.def.src}
      width={frame.def.width}
      height={frame.def.height}
      transform={handTransform(frame)}
      pointerEvents="none"
      style={{ imageRendering: 'auto' }}
    />
  );
}
