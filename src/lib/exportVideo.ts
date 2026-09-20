// Deterministic, frame-by-frame export (spec §8). No screen recording:
// each frame is rendered by seeking the pure canvas function to t = frame/fps
// and rasterized to a canvas.
//
// MP4 / WebM: the browser's own encoders (WebCodecs — H.264 or VP9 video,
// AAC or Opus audio) and a JS muxer write the file; nothing runs in WASM.
// Browsers without WebCodecs fall back to ffmpeg.wasm (JPEG frames + libx264
// / libvpx, audio pre-mixed to WAV because the WASM build crashed decoding
// Opus recordings). GIF, PNG sequences and single-frame snapshots are pure JS.

import type { AudioClip, DrawElement, HandStyle, Project } from '../types';
import { encodeWav, mixdownBuffer, MIX_SAMPLE_RATE } from './audioMix';
import { createEncodeSession } from './mediaEncoder';
import { makeRenderContext, svgStringForTime } from './renderFrame';
import { getFFmpeg, terminateFFmpeg } from './ffmpegClient';
import { HANDS, loadHandDataUrl } from '../assets/hands';

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'png';
export type ExportPhase = 'loading' | 'capturing' | 'encoding' | 'finishing';

export interface ExportOptions {
  format: ExportFormat;
  /** output height in px; width follows the project aspect */
  height: number;
  project: Project;
  elements: DrawElement[];
  audioClips: AudioClip[];
  /** only used by 'png' (single frame) */
  time?: number;
  /** restrict to a time range (e.g. one scene); defaults to the whole project */
  range?: { start: number; end: number };
  signal?: AbortSignal;
  onPhase: (phase: ExportPhase) => void;
  /** 0..1 within the current phase */
  onProgress: (p: number) => void;
}

export interface ExportResult {
  url: string;
  filename: string;
  sizeBytes: number;
  /** what actually did the work, for the UI / diagnostics */
  engine: 'webcodecs' | 'webcodecs+ffmpeg' | 'ffmpeg' | 'js';
}

export const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'mp4', label: 'MP4', ext: 'mp4' },
  { value: 'webm', label: 'WebM', ext: 'webm' },
  { value: 'gif', label: 'GIF', ext: 'gif' },
  { value: 'png-sequence', label: 'PNG frames', ext: 'zip' },
  { value: 'png', label: 'Snapshot', ext: 'png' },
];

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
}

/** Can this browser encode video itself (no ffmpeg needed)? */
export function hasNativeEncoder(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

class ExportCancelled extends Error {
  constructor() { super('Export cancelled.'); this.name = 'AbortError'; }
}
export const isCancelled = (e: unknown) => e instanceof Error && e.name === 'AbortError';

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  );
}

/** Everything needed to paint any time t of the scribe at the output size. */
async function makeFrameRenderer(project: Project, elements: DrawElement[], outW: number, outH: number) {
  // hand photos must be embedded (an SVG rasterized via <img> can't fetch)
  const handImages: Partial<Record<HandStyle, string>> = {};
  const used = new Set<HandStyle>([project.hand, ...elements.map((e) => e.hand ?? project.hand)]);
  await Promise.all(
    HANDS.filter((h) => used.has(h.id)).map(async (h) => {
      handImages[h.id] = await loadHandDataUrl(h);
    }),
  );
  const render = makeRenderContext(project, elements);
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext('2d') as AnyCtx | null;
  if (!ctx) throw new Error('Could not create a 2D canvas context.');

  return {
    canvas,
    ctx,
    async paint(t: number): Promise<void> {
      const svg = svgStringForTime(render, t, outW, outH, handImages);
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = svgUrl;
        await img.decode();
        // video codecs have no alpha: paint the paper colour first
        ctx.fillStyle = project.background;
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, 0, outW, outH);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    },
  };
}

function outputSize(project: Project, height: number): { outW: number; outH: number } {
  const scale = height / project.height;
  // codecs want even dimensions
  return {
    outW: Math.max(2, Math.round((project.width * scale) / 2) * 2),
    outH: Math.max(2, Math.round((project.height * scale) / 2) * 2),
  };
}

function safeName(project: Project): string {
  return project.name.replace(/[^\w\- ]+/g, '').trim() || 'drawflow';
}

function result(blob: Blob, project: Project, ext: string, engine: ExportResult['engine']): ExportResult {
  return { url: URL.createObjectURL(blob), filename: `${safeName(project)}.${ext}`, sizeBytes: blob.size, engine };
}

export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const { project, elements, audioClips, format, signal } = opts;
  const { outW, outH } = outputSize(project, opts.height);
  const check = () => { if (signal?.aborted) throw new ExportCancelled(); };

  opts.onPhase('loading');
  const renderer = await makeFrameRenderer(project, elements, outW, outH);
  const { canvas, ctx } = renderer;
  const fps = project.fps;
  const range = opts.range ?? { start: 0, end: project.duration };
  const duration = Math.max(0, range.end - range.start);

  // ---- single frame -------------------------------------------------------
  if (format === 'png') {
    await renderer.paint(opts.time ?? 0);
    const blob = await canvasToBlob(canvas, 'image/png');
    return result(blob, project, 'png', 'js');
  }

  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const timing = { raster: 0, encode: 0, finish: 0 };
  const t0 = performance.now();

  /** Paint frame i (time within the range) and hand it to `sink`. */
  const captureAll = async (step: number, sink: (i: number) => Promise<void>) => {
    opts.onPhase('capturing');
    for (let frame = 0; frame < totalFrames; frame += step) {
      check();
      let s = performance.now();
      await renderer.paint(range.start + frame / fps);
      timing.raster += performance.now() - s; s = performance.now();
      await sink(frame);
      timing.encode += performance.now() - s;
      opts.onProgress(frame / totalFrames);
      if (frame % 5 === 0) await nextFrame(); // keep the UI responsive
    }
  };

  // ---- PNG sequence (zip) -------------------------------------------------
  if (format === 'png-sequence') {
    const { zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    await captureAll(1, async (i) => {
      const blob = await canvasToBlob(canvas, 'image/png');
      files[`frame_${String(i).padStart(5, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
    });
    opts.onPhase('finishing');
    const zipped = zipSync(files, { level: 0 }); // PNGs are already compressed
    return result(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), project, 'zip', 'js');
  }

  // ---- GIF ----------------------------------------------------------------
  if (format === 'gif') {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const step = Math.max(1, Math.round(fps / 15)); // GIFs above ~15 fps are huge for no gain
    const delay = Math.round((1000 * step) / fps);
    const gif = GIFEncoder();
    await captureAll(step, async () => {
      const { data } = ctx.getImageData(0, 0, outW, outH);
      const palette = quantize(data, 256, { format: 'rgb444' });
      const index = applyPalette(data, palette, 'rgb444');
      gif.writeFrame(index, outW, outH, { palette, delay });
    });
    opts.onPhase('finishing');
    gif.finish();
    const bytes = gif.bytes();
    return result(new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' }), project, 'gif', 'js');
  }

  // ---- MP4 / WebM ---------------------------------------------------------
  const wantAudio = audioClips.some((c) => !c.muted && c.duration > 0);
  const session = await createEncodeSession({
    format, width: outW, height: outH, fps,
    audio: wantAudio ? { sampleRate: MIX_SAMPLE_RATE, channels: 2 } : undefined,
  });

  if (session) {
    try {
      await captureAll(1, (i) => session.addFrame(canvas, i));
      let mix: AudioBuffer | null = null;
      if (wantAudio) {
        opts.onPhase('encoding');
        mix = await mixdownBuffer(rangeClips(audioClips, range), duration);
        check();
        if (mix && session.audioSupported) await session.addAudio(mix);
      }
      opts.onPhase('finishing');
      const s = performance.now();
      const file = await session.finish();
      timing.finish = performance.now() - s;
      const type = format === 'mp4' ? 'video/mp4' : 'video/webm';
      if (!mix || session.audioSupported) {
        console.info('[export]', format, `${outW}x${outH}`, totalFrames, 'frames in', Math.round(performance.now() - t0), 'ms', timing);
        return result(new Blob([file.buffer as ArrayBuffer], { type }), project, format, 'webcodecs');
      }
      // video done natively, but no audio encoder here: let ffmpeg attach the WAV
      const blob = await ffmpegMuxAudio(file, encodeWav(mix), format, duration, opts);
      console.info('[export]', format, 'webcodecs+ffmpeg', Math.round(performance.now() - t0), 'ms', timing);
      return result(blob, project, format, 'webcodecs+ffmpeg');
    } finally {
      session.abort();
    }
  }

  // ---- software fallback (no WebCodecs) -----------------------------------
  const blob = await ffmpegSoftwareExport({
    canvas, paintAll: captureAll, format, fps, duration,
    clips: rangeClips(audioClips, range), wantAudio, opts,
  });
  console.info('[export]', format, 'ffmpeg software', Math.round(performance.now() - t0), 'ms', timing);
  return result(blob, project, format, 'ffmpeg');
}

/** Shift clips so the exported range starts at 0 (for scene exports). */
function rangeClips(clips: AudioClip[], range: { start: number; end: number }): AudioClip[] {
  if (range.start === 0) return clips;
  return clips
    .map((c) => ({ ...c, startTime: c.startTime - range.start }))
    .filter((c) => c.startTime + c.duration > 0 && c.startTime < range.end - range.start);
}

function requireIsolation(): void {
  if (isCrossOriginIsolated()) return;
  throw new Error(
    'This browser has no built-in video encoder, and the fallback encoder needs the page ' +
      'to be cross-origin isolated. Serve the app over HTTPS with these headers:\n' +
      'Cross-Origin-Opener-Policy: same-origin\n' +
      'Cross-Origin-Embedder-Policy: require-corp',
  );
}

/** Run ffmpeg with cancel support; the FS is cleaned by the caller. */
async function runFFmpeg(args: string[], opts: ExportOptions): Promise<void> {
  const ffmpeg = await getFFmpeg();
  const onProgress = ({ progress }: { progress: number }) => opts.onProgress(Math.min(Math.max(progress, 0), 1));
  const onAbort = () => terminateFFmpeg();
  ffmpeg.on('progress', onProgress);
  opts.signal?.addEventListener('abort', onAbort);
  try {
    await ffmpeg.exec(args);
  } catch (e) {
    if (opts.signal?.aborted) throw new ExportCancelled();
    throw e;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    try { ffmpeg.off('progress', onProgress); } catch { /* terminated */ }
  }
}

async function ffmpegMuxAudio(
  video: Uint8Array, wav: Uint8Array, format: 'mp4' | 'webm', duration: number, opts: ExportOptions,
): Promise<Blob> {
  requireIsolation();
  const ffmpeg = await getFFmpeg();
  const inName = `video.${format}`;
  const outName = `out.${format}`;
  await ffmpeg.writeFile(inName, video);
  await ffmpeg.writeFile('mix.wav', wav);
  try {
    await runFFmpeg([
      '-i', inName, '-i', 'mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', format === 'mp4' ? 'aac' : 'libopus', '-b:a', '160k', '-t', duration.toFixed(3), outName,
    ], opts);
    const data = await ffmpeg.readFile(outName);
    if (typeof data === 'string') throw new Error('Unexpected ffmpeg output.');
    return new Blob([data.buffer as ArrayBuffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    for (const n of [inName, 'mix.wav', outName]) {
      try { await ffmpeg.deleteFile(n); } catch { /* best effort */ }
    }
  }
}

async function ffmpegSoftwareExport(p: {
  canvas: AnyCanvas;
  paintAll: (step: number, sink: (i: number) => Promise<void>) => Promise<void>;
  format: 'mp4' | 'webm';
  fps: number; duration: number;
  clips: AudioClip[]; wantAudio: boolean; opts: ExportOptions;
}): Promise<Blob> {
  requireIsolation();
  const ffmpeg = await getFFmpeg();
  const written: string[] = [];
  const outName = `out.${p.format}`;
  try {
    // high-quality JPEG frames: several times faster to encode than PNG at
    // 1080p, and the video codec is lossy anyway
    await p.paintAll(1, async (i) => {
      const blob = await canvasToBlob(p.canvas, 'image/jpeg', 0.94);
      const name = `frame_${String(i).padStart(5, '0')}.jpg`;
      await ffmpeg.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
      written.push(name);
    });

    let hasAudio = false;
    if (p.wantAudio) {
      const mix = await mixdownBuffer(p.clips, p.duration);
      if (mix) {
        await ffmpeg.writeFile('mix.wav', encodeWav(mix));
        written.push('mix.wav');
        hasAudio = true;
      }
    }

    p.opts.onPhase('encoding');
    p.opts.onProgress(0);
    const args = ['-framerate', String(p.fps), '-start_number', '0', '-i', 'frame_%05d.jpg'];
    if (hasAudio) args.push('-i', 'mix.wav');
    if (p.format === 'mp4') {
      // veryfast is ~3× quicker than medium in the single-threaded WASM build
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21');
    } else {
      args.push('-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8');
    }
    args.push('-pix_fmt', 'yuv420p');
    if (hasAudio) {
      args.push('-map', '0:v', '-map', '1:a', '-c:a', p.format === 'mp4' ? 'aac' : 'libopus', '-b:a', '160k');
      args.push('-t', p.duration.toFixed(3));
    }
    args.push(outName);
    await runFFmpeg(args, p.opts);
    written.push(outName);

    const data = await ffmpeg.readFile(outName);
    if (typeof data === 'string') throw new Error('Unexpected ffmpeg output.');
    return new Blob([data.buffer as ArrayBuffer], { type: p.format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    // clear the virtual FS so repeated exports don't leak memory (pitfall #8)
    for (const name of written) {
      try { await ffmpeg.deleteFile(name); } catch { /* best effort / terminated */ }
    }
  }
}
