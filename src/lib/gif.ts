// Animated GIFs on the board. A picture's data: URL stays the one source of
// truth; its frames are decoded once into this cache, and the frame shown is
// worked out from the video's time. So the canvas stays a pure function of
// time: scrubbing, playing and exporting all show the same frame.
//
// Without ImageDecoder (Safari) a GIF simply stays a still picture.

interface GifFrames {
  /** when each frame ends, in seconds from the start of the loop */
  ends: number[];
  bitmaps: ImageBitmap[];
  /** made the first time a frame is needed: only SVG rendering wants them */
  urls: (string | null)[];
}

/** Frames beyond this many pixels in total are scaled down, so a long GIF can't exhaust memory. */
const MAX_PIXELS = 120_000_000;
/** Browsers play delays under 20 ms at 100 ms, because old GIFs rely on that. */
const shortDelay = (micros: number) => (micros >= 20_000 ? micros : 100_000);

// ImageDecoder is not in TypeScript's DOM types yet
interface DecodedImage { image: VideoFrame }
interface GifDecoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  completed: Promise<void>;
  decode(o: { frameIndex: number }): Promise<DecodedImage>;
  close(): void;
}
type GifDecoderClass = new (o: { data: ArrayBuffer; type: string }) => GifDecoder;
const decoderClass = () => (globalThis as unknown as { ImageDecoder?: GifDecoderClass }).ImageDecoder;

const decoded = new Map<string, GifFrames | null>();
const pending = new Map<string, Promise<GifFrames | null>>();

export const isGifSrc = (src: string | undefined): src is string => !!src && src.startsWith('data:image/gif');

/** How many frames a GIF has (0 when this browser can't tell). */
export async function gifFrameCount(src: string): Promise<number> {
  const Decoder = decoderClass();
  if (!Decoder) return 0;
  try {
    const dec = new Decoder({ data: await (await fetch(src)).arrayBuffer(), type: 'image/gif' });
    await dec.tracks.ready;
    await dec.completed;
    const n = dec.tracks.selectedTrack?.frameCount ?? 0;
    dec.close();
    return n;
  } catch {
    return 0;
  }
}

async function decode(src: string): Promise<GifFrames | null> {
  const Decoder = decoderClass();
  if (!Decoder) return null;
  const dec = new Decoder({ data: await (await fetch(src)).arrayBuffer(), type: 'image/gif' });
  try {
    await dec.tracks.ready;
    await dec.completed;
    const count = dec.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2) return null;
    const out: GifFrames = { ends: [], bitmaps: [], urls: [] };
    let clock = 0;
    let size: { resizeWidth: number; resizeHeight: number } | undefined;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      if (i === 0) {
        const w = image.displayWidth, h = image.displayHeight;
        const fit = Math.sqrt(MAX_PIXELS / Math.max(1, w * h * count));
        if (fit < 1) size = { resizeWidth: Math.max(1, Math.round(w * fit)), resizeHeight: Math.max(1, Math.round(h * fit)) };
      }
      clock += shortDelay(image.duration ?? 0) / 1e6;
      out.bitmaps.push(await createImageBitmap(image, size));
      image.close();
      out.ends.push(clock);
      out.urls.push(null);
    }
    return out;
  } finally {
    dec.close();
  }
}

function load(src: string): Promise<GifFrames | null> {
  let job = pending.get(src);
  if (!job) {
    job = decode(src).catch((e) => { console.warn('[gif] could not decode', e); return null; }).then((frames) => {
      decoded.set(src, frames);
      pending.delete(src);
      return frames;
    });
    pending.set(src, job);
  }
  return job;
}

/** Decode the GIFs among these sources and free the ones no longer used. Resolves true if new frames arrived. */
export async function prepareGifs(sources: (string | undefined)[]): Promise<boolean> {
  const wanted = new Set(sources.filter(isGifSrc));
  for (const [src, gif] of decoded) {
    if (wanted.has(src)) continue;
    decoded.delete(src);
    gif?.bitmaps.forEach((b) => b.close());
  }
  const todo = [...wanted].filter((src) => !decoded.has(src));
  if (!todo.length) return false;
  const frames = await Promise.all(todo.map(load));
  return frames.some(Boolean);
}

function frameUrl(gif: GifFrames, i: number): string {
  let url = gif.urls[i];
  if (!url) {
    const bitmap = gif.bitmaps[i];
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    url = gif.urls[i] = canvas.toDataURL('image/png');
  }
  return url;
}

/** The frame of a GIF `time` seconds after it first appeared; it loops. Null when it isn't an animated GIF. */
export function gifFrameAt(src: string, time: number): { bitmap: ImageBitmap; url: () => string } | null {
  if (!isGifSrc(src)) return null;
  const gif = decoded.get(src);
  if (!gif) return null;
  const total = gif.ends[gif.ends.length - 1];
  const t = Math.max(0, time) % total;
  let lo = 0, hi = gif.ends.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < gif.ends[mid]) hi = mid; else lo = mid + 1;
  }
  return { bitmap: gif.bitmaps[lo], url: () => frameUrl(gif, lo) };
}
