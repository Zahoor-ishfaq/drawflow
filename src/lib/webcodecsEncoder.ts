// Hardware-accelerated H.264 via the browser's WebCodecs VideoEncoder, muxed
// straight into an MP4. Frames are handed over as VideoFrames from the canvas
// — no per-frame image encoding at all. Returns null when the browser can't
// do it, and the caller falls back to the ffmpeg.wasm software path.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface H264Session {
  /** submit the current canvas contents as frame `index` */
  addFrame(canvas: OffscreenCanvas | HTMLCanvasElement, index: number): Promise<void>;
  /** finish and return a complete MP4 (video only) */
  finish(): Promise<Uint8Array>;
  abort(): void;
}

function bitrateFor(width: number, height: number, fps: number): number {
  // whiteboard footage is mostly flat colour; this is generous
  const px = width * height * fps;
  return Math.round(Math.min(10e6, Math.max(2e6, px * 0.09)));
}

export async function createH264Session(width: number, height: number, fps: number): Promise<H264Session | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const config: VideoEncoderConfig = {
    codec: height > 720 ? 'avc1.640028' : 'avc1.4d401f', // High@4.0 / Main@3.1
    width,
    height,
    framerate: fps,
    bitrate: bitrateFor(width, height, fps),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    avc: { format: 'avc' },
  } as VideoEncoderConfig;
  try {
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) return null;
  } catch {
    return null;
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? {}),
    error: (e) => { failure = e; },
  });
  encoder.configure(config);

  const frameMicros = 1e6 / fps;
  const keyEvery = fps * 2;
  const waitForQueue = () =>
    new Promise<void>((resolve) => {
      const tick = () => (encoder.encodeQueueSize > 6 && !failure ? setTimeout(tick, 4) : resolve());
      tick();
    });

  return {
    async addFrame(canvas, index) {
      if (failure) throw failure;
      await waitForQueue();
      const frame = new VideoFrame(canvas as unknown as CanvasImageSource, {
        timestamp: Math.round(index * frameMicros),
        duration: Math.round(frameMicros),
      });
      try {
        encoder.encode(frame, { keyFrame: index % keyEvery === 0 });
      } finally {
        frame.close();
      }
    },
    async finish() {
      await encoder.flush();
      if (failure) throw failure;
      encoder.close();
      muxer.finalize();
      return new Uint8Array(muxer.target.buffer);
    },
    abort() {
      try { encoder.close(); } catch { /* noop */ }
    },
  };
}
