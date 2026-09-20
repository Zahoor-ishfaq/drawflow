// Deterministic, frame-by-frame export (spec §8). No screen recording:
// each frame is rendered by seeking the pure canvas function to t = frame/fps
// and rasterized to a canvas. MP4 goes through the browser's own H.264
// encoder (WebCodecs) with ffmpeg.wasm only attaching the audio; WebM and
// browsers without WebCodecs fall back to JPEG frames + ffmpeg's software codecs.
// Audio is always pre-mixed in the browser to one WAV — ffmpeg.wasm crashed
// ("memory access out of bounds") decoding WebM/Opus recordings directly.

import type { AudioClip, DrawElement, HandStyle, Project } from '../types';
import { mixdownWav } from './audioMix';
import { createH264Session } from './webcodecsEncoder';
import { makeRenderContext, svgStringForTime } from './renderFrame';
import { getFFmpeg } from './ffmpegClient';
import { HANDS, loadHandDataUrl } from '../assets/hands';

export type ExportFormat = 'mp4' | 'webm';
export type ExportPhase = 'loading' | 'capturing' | 'encoding';

export interface ExportOptions {
  format: ExportFormat;
  height: 720 | 1080;
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];
  onPhase: (phase: ExportPhase) => void;
  /** 0..1 within the current phase */
  onProgress: (p: number) => void;
}

export interface ExportResult {
  url: string;
  filename: string;
  sizeBytes: number;
}

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Frames go to the encoder as high-quality JPEGs: several times faster to
// encode than PNG at 1080p, and the video codec is lossy anyway.
const FRAME_TYPE = 'image/jpeg';
const FRAME_QUALITY = 0.94;

function canvasToFrameBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: FRAME_TYPE, quality: FRAME_QUALITY });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), FRAME_TYPE, FRAME_QUALITY),
  );
}

export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const { project, elements, audioClips, format } = opts;

  if (!isCrossOriginIsolated()) {
    throw new Error(
      'Export needs SharedArrayBuffer, which requires the page to be cross-origin ' +
        'isolated. Serve the app over HTTPS with these headers:\n' +
        'Cross-Origin-Opener-Policy: same-origin\n' +
        'Cross-Origin-Embedder-Policy: require-corp',
    );
  }

  const scale = opts.height / project.height;
  // libx264 requires even dimensions; round here and keep the crop filter as a belt-and-braces
  const outW = Math.round((project.width * scale) / 2) * 2;
  const outH = Math.round((project.height * scale) / 2) * 2;

  opts.onPhase('loading');
  const ffmpeg = await getFFmpeg();

  // hand photos must be embedded (an SVG rasterized via <img> can't fetch)
  const handImages: Partial<Record<HandStyle, string>> = {};
  const used = new Set<HandStyle>([project.hand, ...elements.map((e) => e.hand ?? project.hand)]);
  await Promise.all(
    HANDS.filter((h) => used.has(h.id)).map(async (h) => {
      handImages[h.id] = await loadHandDataUrl(h);
    }),
  );
  const render = makeRenderContext(project, elements);

  const fps = project.fps;
  const totalFrames = Math.ceil(project.duration * fps);
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('Could not create a 2D canvas context.');

  const frameName = (i: number) => `frame_${String(i).padStart(5, '0')}.jpg`;
  const written: string[] = [];
  const audioFiles: string[] = [];

  // MP4: the browser's own (usually hardware) H.264 encoder takes frames
  // straight from the canvas; ffmpeg then only attaches the audio (a copy).
  const hw = format === 'mp4' ? await createH264Session(outW, outH, fps) : null;

  const timing = { svg: 0, raster: 0, encode: 0, write: 0, ffmpeg: 0 };
  try {
    opts.onPhase('capturing');
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      let t0 = performance.now();
      const svg = svgStringForTime(render, t, outW, outH, handImages);
      timing.svg += performance.now() - t0; t0 = performance.now();
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = svgUrl;
        await img.decode();
        // JPEG has no alpha: paint the paper colour first
        ctx.fillStyle = project.background;
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, 0, outW, outH);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
      timing.raster += performance.now() - t0; t0 = performance.now();
      if (hw) {
        await hw.addFrame(canvas, frame);
        timing.encode += performance.now() - t0;
      } else {
        const shot = await canvasToFrameBlob(canvas);
        const bytes = new Uint8Array(await shot.arrayBuffer());
        timing.encode += performance.now() - t0; t0 = performance.now();
        const name = frameName(frame);
        await ffmpeg.writeFile(name, bytes);
        timing.write += performance.now() - t0;
        written.push(name);
      }
      opts.onProgress(frame / totalFrames);
      if (frame % 5 === 0) await nextFrame(); // keep the UI responsive
    }

    // all clips mixed in the browser into one WAV — the encoder never decodes
    // compressed audio (that crashed the WASM build on some inputs)
    let hasAudio = false;
    if (audioClips.some((c) => !c.muted)) {
      const wav = await mixdownWav(audioClips, project.duration);
      if (wav) {
        await ffmpeg.writeFile('mix.wav', wav);
        audioFiles.push('mix.wav');
        hasAudio = true;
      }
    }

    opts.onPhase('encoding');
    opts.onProgress(0);
    const onFfProgress = ({ progress }: { progress: number }) => {
      opts.onProgress(Math.min(Math.max(progress, 0), 1));
    };
    ffmpeg.on('progress', onFfProgress);

    const outName = format === 'mp4' ? 'out.mp4' : 'out.webm';
    if (hw) {
      const tHw = performance.now();
      const video = await hw.finish();
      timing.ffmpeg = performance.now() - tHw;
      if (!hasAudio) {
        console.info('[export] frames', totalFrames, 'hardware —', Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])));
        const safe = project.name.replace(/[^\w\- ]+/g, '').trim() || 'drawflow';
        const blob = new Blob([video.buffer as ArrayBuffer], { type: 'video/mp4' });
        return { url: URL.createObjectURL(blob), filename: `${safe}.mp4`, sizeBytes: blob.size };
      }
      await ffmpeg.writeFile('video.mp4', video);
      written.push('video.mp4');
    }
    const args: string[] = hw
      ? ['-i', 'video.mp4']
      : ['-framerate', String(fps), '-start_number', '0', '-i', 'frame_%05d.jpg'];
    if (hasAudio) args.push('-i', 'mix.wav');
    if (hw) {
      args.push('-c:v', 'copy');
    } else if (format === 'mp4') {
      // veryfast is ~3× quicker than medium in the single-threaded WASM build;
      // whiteboard footage compresses well regardless
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21');
    } else {
      args.push('-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8');
    }
    if (!hw) args.push('-pix_fmt', 'yuv420p', '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2'); // even dimensions
    if (hasAudio) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', format === 'mp4' ? 'aac' : 'libopus', '-b:a', '160k');
      args.push('-t', project.duration.toFixed(3));
    }
    args.push(outName);

    const tEnc = performance.now();
    try {
      await ffmpeg.exec(args);
    } finally {
      ffmpeg.off('progress', onFfProgress);
      timing.ffmpeg = performance.now() - tEnc;
      console.info('[export] frames', totalFrames, hw ? 'hardware+mux —' : 'software —', Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])));
    }

    const data = await ffmpeg.readFile(outName);
    if (typeof data === 'string') throw new Error('Unexpected ffmpeg output.');
    const blob = new Blob([data.buffer as ArrayBuffer], {
      type: format === 'mp4' ? 'video/mp4' : 'video/webm',
    });
    try { await ffmpeg.deleteFile(outName); } catch { /* best effort */ }

    const safeName = project.name.replace(/[^\w\- ]+/g, '').trim() || 'drawflow';
    return {
      url: URL.createObjectURL(blob),
      filename: `${safeName}.${format}`,
      sizeBytes: blob.size,
    };
  } finally {
    hw?.abort();
    // clear the virtual FS so repeated exports don't leak memory (pitfall #8)
    for (const name of written) {
      try { await ffmpeg.deleteFile(name); } catch { /* best effort */ }
    }
    for (const name of audioFiles) {
      try { await ffmpeg.deleteFile(name); } catch { /* best effort */ }
    }
  }
}
