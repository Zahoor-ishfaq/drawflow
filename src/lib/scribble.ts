// Scribble-reveal for raster images (what VideoScribe does with photos): a
// back-and-forth zigzag that covers the picture; used as a stroke mask that
// reveals the image with the dash trick, and as the path the hand follows.

const ROWS_ACROSS_LONG_SIDE = 14;

export function scribbleSpacing(w: number, h: number): number {
  return Math.max(w, h) / ROWS_ACROSS_LONG_SIDE;
}

/** Mask stroke width that guarantees overlap between rows. */
export function scribbleStrokeWidth(w: number, h: number): number {
  return scribbleSpacing(w, h) * 1.3;
}

export function scribblePath(w: number, h: number): string {
  const s = scribbleSpacing(w, h);
  const pts: string[] = [];
  let y = s * 0.45;
  let dir = 1;
  pts.push(`M0 ${y.toFixed(1)}`);
  while (y < h + s * 0.5) {
    // slight diagonal per pass so it reads as a hand scribbling
    const yEnd = Math.min(y + s * 0.55, h + s * 0.5);
    const x = dir > 0 ? w : 0;
    pts.push(`L${x} ${yEnd.toFixed(1)}`);
    y = yEnd + s * 0.45;
    dir = -dir;
    if (y < h + s * 0.5) pts.push(`L${x} ${y.toFixed(1)}`);
  }
  return pts.join('');
}
