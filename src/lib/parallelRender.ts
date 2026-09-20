// Fast export path: frames are painted with the Canvas2D renderer (a couple
// of milliseconds each) and pushed through several VideoEncoders at once,
// each encoding its own contiguous segment of the video. WebCodecs runs the
// codecs on their own threads, so encoding scales with the CPU cores while
// the main thread only paints. The compressed chunks are muxed in order.
//
// Why not Web Workers: reading pixels out of a worker's OffscreenCanvas
// round-trips through the GPU process (~100 ms a frame in Chromium), which
// is slower than everything else combined. Main-thread canvases are cheap
// to capture, and the painter is nowhere near the bottleneck.

import { allHands, type HandDef } from '../assets/hands';
import { cameraAt, viewBoxFor } from './camera';
import {
  handFrameAt, paperAt, sceneOverlayAt, visibleAt, type RenderContext,
} from './renderFrame';
import { createCanvasPainter, type CanvasAssets, type FrameSpec } from './canvasRender';

export interface RawChunk {
  type: 'key' | 'delta';
  timestamp: number;
  duration: number;
  data: ArrayBuffer;
}

export interface ParallelOptions {
  ctx: RenderContext;
  outW: number;
  outH: number;
  fps: number;
  /** first frame time (seconds) and total number of frames */
  start: number;
  totalFrames: number;
  videoConfig: VideoEncoderConfig;
  keyEvery: number;
  signal?: AbortSignal;
  /** compressed chunks of one segment, delivered strictly in order */
  onSegment: (chunks: RawChunk[], description: ArrayBuffer | null) => void;
  onProgress?: (done: number) => void;
  /** override the number of concurrent encoders */
  lanes?: number;
}

export interface ParallelStats {
  lanes: number;
  paintMs: number;
  captureMs: number;
  waitMs: number;
  initMs: number;
}

export function canRenderFast(): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof VideoFrame !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' && typeof createImageBitmap !== 'undefined' &&
    typeof Path2D !== 'undefined';
}

async function bitmapFromDataUrl(src: string): Promise<ImageBitmap> {
  const blob = await (await fetch(src)).blob();
  return createImageBitmap(blob);
}

/** Frame description for the painter: everything except pixels. */
export function frameSpec(ctx: RenderContext, t: number): FrameSpec {
  const { project, ordered, timeline } = ctx;
  const view = viewBoxFor(cameraAt(t, timeline, project), project);
  const h = handFrameAt(ordered, t, project, timeline);
  return {
    t,
    view,
    hand: h ? { defId: h.def.id, x: h.x, y: h.y, scale: h.scale, offset: h.offset } : null,
    paper: paperAt(ctx, t),
    overlay: sceneOverlayAt(t, ctx.scenes),
    elementIds: visibleAt(ctx, t).map((e) => e.id),
  };
}

/** Decode every picture and hand photo the scribe uses. */
export async function loadCanvasAssets(ctx: RenderContext): Promise<CanvasAssets> {
  const { project } = ctx;
  const images = new Map<string, ImageBitmap>();
  for (const el of ctx.stacked) {
    if (el.kind === 'image' && el.image) images.set(el.id, await bitmapFromDataUrl(el.image.src));
  }
  const used = new Set<string>([project.hand, ...ctx.ordered.map((e) => e.hand ?? project.hand)]);
  const hands = new Map<string, { def: HandDef; bitmap: ImageBitmap }>();
  for (const def of allHands(project)) {
    if (used.has(def.id)) hands.set(def.id, { def, bitmap: await bitmapFromDataUrl(def.src) });
  }
  return { images, hands };
}

interface Lane {
  from: number;
  to: number;
  next: number;              // next frame index to submit
  canvas: OffscreenCanvas;
  painter: ReturnType<typeof createCanvasPainter>;
  encoder: VideoEncoder;
  chunks: RawChunk[];
  description: ArrayBuffer | null;
  done: boolean;
}

function laneCount(opts: ParallelOptions): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  let override = opts.lanes;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('drawflow.exportLanes') : null;
    if (raw && !override) override = parseInt(raw, 10) || undefined;
  } catch { /* ignore */ }
  // one encoder per physical core (hardwareConcurrency counts hyper-threads;
  // a third encoder on a 2-core machine measured slower than two)
  return Math.max(1, Math.min(override ?? Math.max(1, Math.floor(cores / 2)), 6, Math.ceil(opts.totalFrames / opts.fps)));
}

/**
 * Paint and encode every frame, several segments at a time. Resolves with
 * timing stats once the last segment has been delivered in order.
 */
export async function renderAndEncodeParallel(opts: ParallelOptions): Promise<ParallelStats> {
  const { ctx, outW, outH, fps, start, totalFrames, signal, keyEvery } = opts;
  const lanes = laneCount(opts);
  const segSize = Math.ceil(totalFrames / lanes);
  const frameMicros = 1e6 / fps;
  const stats: ParallelStats = { lanes, paintMs: 0, captureMs: 0, waitMs: 0, initMs: 0 };

  const tInit = performance.now();
  const assets = await loadCanvasAssets(ctx);
  const elements = new Map(ctx.stacked.map((e) => [e.id, e]));
  let failure: Error | null = null;

  const pool: Lane[] = [];
  for (let s = 0; s < lanes; s++) {
    const from = s * segSize;
    const to = Math.min(totalFrames, from + segSize);
    if (from >= to) break;
    // one canvas per lane so encoders never wait on each other's readbacks
    const laneCanvas = new OffscreenCanvas(outW, outH);
    const lane: Lane = {
      from, to, next: from, chunks: [], description: null, done: false,
      canvas: laneCanvas,
      painter: createCanvasPainter(laneCanvas, ctx.project, elements, assets),
      encoder: null as unknown as VideoEncoder,
    };
    lane.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(data);
        lane.chunks.push({ type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, data });
        const desc = meta?.decoderConfig?.description;
        if (desc && !lane.description) {
          lane.description = desc instanceof ArrayBuffer ? desc.slice(0) : (desc as ArrayBufferView).buffer.slice(0) as ArrayBuffer;
        }
      },
      error: (e) => { failure = e; },
    });
    lane.encoder.configure(opts.videoConfig);
    pool.push(lane);
  }
  stats.initMs = performance.now() - tInit;

  const check = () => {
    if (signal?.aborted) throw Object.assign(new Error('Export cancelled.'), { name: 'AbortError' });
    if (failure) throw failure;
  };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  try {
    let submitted = 0;
    let lastProgress = 0;
    // every lane runs its own loop; they interleave at the back-pressure awaits
    await Promise.all(pool.map(async (lane) => {
      for (let i = lane.from; i < lane.to; i++) {
        check();
        while (lane.encoder.encodeQueueSize > 4) {
          const tw = performance.now();
          await sleep(1);
          stats.waitMs += performance.now() - tw;
          check();
        }
        let t0 = performance.now();
        lane.painter.paint(frameSpec(ctx, start + i / fps));
        stats.paintMs += performance.now() - t0; t0 = performance.now();
        const frame = new VideoFrame(lane.canvas, { timestamp: Math.round(i * frameMicros), duration: Math.round(frameMicros) });
        try {
          lane.encoder.encode(frame, { keyFrame: i === lane.from || i % keyEvery === 0 });
        } finally {
          frame.close();
        }
        stats.captureMs += performance.now() - t0;
        lane.next = i + 1;
        submitted++;
        if (submitted - lastProgress >= 8) { lastProgress = submitted; opts.onProgress?.(submitted); await sleep(0); }
      }
    }));
    // drain and deliver in order
    for (const lane of pool) {
      check();
      await lane.encoder.flush();
      check();
      lane.encoder.close();
      lane.done = true;
      opts.onSegment(lane.chunks, lane.description);
      opts.onProgress?.(lane.to);
    }
    return stats;
  } finally {
    for (const lane of pool) {
      try { if (lane.encoder.state !== 'closed') lane.encoder.close(); } catch { /* noop */ }
    }
    for (const b of assets.images.values()) b.close();
    for (const h of assets.hands.values()) h.bitmap.close();
  }
}
