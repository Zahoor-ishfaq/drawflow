// Deterministic, frame-by-frame export (spec §8). No screen recording:
// each frame is rendered by seeking the pure canvas function to t = frame/fps,
// rasterized to PNG, written to ffmpeg's virtual FS, then encoded.

import type { AudioTrack, DrawElement, HandStyle, Project } from '../types';
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
  audio: AudioTrack | null;
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

function canvasToPngBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const { project, elements, audio, format } = opts;

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

  const frameName = (i: number) => `frame_${String(i).padStart(5, '0')}.png`;
  const written: string[] = [];
  let audioName: string | null = null;

  try {
    opts.onPhase('capturing');
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      const svg = svgStringForTime(render, t, outW, outH, handImages);
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = svgUrl;
        await img.decode();
        ctx.clearRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, 0, outW, outH);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
      const png = await canvasToPngBlob(canvas);
      const name = frameName(frame);
      await ffmpeg.writeFile(name, new Uint8Array(await png.arrayBuffer()));
      written.push(name);
      opts.onProgress(frame / totalFrames);
      if (frame % 5 === 0) await nextFrame(); // keep the UI responsive
    }

    if (audio?.buffer) {
      const res = await fetch(audio.url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = audio.name.split('.').pop()?.toLowerCase() ?? 'mp3';
      audioName = `audio_in.${ext}`;
      await ffmpeg.writeFile(audioName, bytes);
    }

    opts.onPhase('encoding');
    opts.onProgress(0);
    const onFfProgress = ({ progress }: { progress: number }) => {
      opts.onProgress(Math.min(Math.max(progress, 0), 1));
    };
    ffmpeg.on('progress', onFfProgress);

    const outName = format === 'mp4' ? 'out.mp4' : 'out.webm';
    const args: string[] = ['-framerate', String(fps), '-start_number', '0', '-i', 'frame_%05d.png'];
    if (audioName && audio) {
      const clipLen = Math.max(0, audio.duration - audio.trimStart - audio.trimEnd);
      if (audio.trimStart > 0) args.push('-ss', audio.trimStart.toFixed(3));
      args.push('-t', clipLen.toFixed(3));
      if (audio.startTime > 0) args.push('-itsoffset', audio.startTime.toFixed(3));
      args.push('-i', audioName);
    }
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
    } else {
      args.push('-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0');
    }
    args.push(
      '-pix_fmt', 'yuv420p',
      '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2', // ffmpeg needs even dimensions
    );
    if (audioName && audio) {
      args.push('-map', '0:v', '-map', '1:a');
      args.push('-c:a', format === 'mp4' ? 'aac' : 'libopus');
      if (audio.volume !== 1) args.push('-af', `volume=${audio.volume}`);
      args.push('-shortest');
    }
    args.push(outName);

    try {
      await ffmpeg.exec(args);
    } finally {
      ffmpeg.off('progress', onFfProgress);
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
    // clear the virtual FS so repeated exports don't leak memory (pitfall #8)
    for (const name of written) {
      try { await ffmpeg.deleteFile(name); } catch { /* best effort */ }
    }
    if (audioName) {
      try { await ffmpeg.deleteFile(audioName); } catch { /* best effort */ }
    }
  }
}
