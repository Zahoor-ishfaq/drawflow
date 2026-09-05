/** `MM:SS.FF` timecode (FF = frame within the second). */
export function formatTimecode(t: number, fps: number): string {
  const clamped = Math.max(0, t);
  const totalFrames = Math.round(clamped * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  return `${pad(m)}:${pad(s)}.${pad(frames)}`;
}

/** `M:SS` for ruler labels. */
export function formatRulerLabel(t: number): string {
  const s = Math.floor(t % 60);
  const m = Math.floor(t / 60);
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
