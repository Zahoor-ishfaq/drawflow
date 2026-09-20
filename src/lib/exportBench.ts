// Developer benchmark: how fast can this machine encode real frames of the
// current project? Exposed as window.DrawFlow.bench() so it can be run from
// the console or an automation script; not part of the UI.

import { useStore } from '../store/useStore';
import { makeRenderContext } from './renderFrame';
import { createCanvasPainter } from './canvasRender';
import { frameSpec, loadCanvasAssets } from './parallelRender';
import { encoderTweaks } from './mediaEncoder';

export async function exportBench(height = 1080, seconds = 4): Promise<Record<string, string | number>> {
  const s = useStore.getState();
  const ctx = makeRenderContext(s.project, s.elements);
  const outH = height;
  const outW = Math.round((s.project.width * outH) / s.project.height / 2) * 2;
  const fps = s.project.fps;
  const n = Math.min(Math.ceil(s.project.duration * fps), seconds * fps);
  const assets = await loadCanvasAssets(ctx);
  const canvas = new OffscreenCanvas(outW, outH);
  const painter = createCanvasPainter(canvas, s.project, new Map(ctx.stacked.map((e) => [e.id, e])), assets);
  const out: Record<string, string | number> = { frames: n, size: `${outW}x${outH}` };

  // paint once, keep RGBA copies so the encoders see identical real content
  let t0 = performance.now();
  const rgba: ArrayBuffer[] = [];
  const c2 = canvas.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    painter.paint(frameSpec(ctx, i / fps));
    if (i < 8) rgba.push(c2.getImageData(0, 0, outW, outH).data.buffer);
  }
  out.paintMsPerFrame = +((performance.now() - t0) / n).toFixed(2);

  const config: VideoEncoderConfig = {
    codec: 'avc1.640028', width: outW, height: outH, framerate: fps, bitrate: 8e6, bitrateMode: 'variable', latencyMode: 'quality',
    avc: { format: 'avc' },
    ...encoderTweaks(),
  } as VideoEncoderConfig;
  out.tweaks = JSON.stringify(encoderTweaks());
  const run = async (lanes: number, source: 'canvas' | 'buffer') => {
    const encoders = Array.from({ length: lanes }, () => {
      const e = new VideoEncoder({ output: () => {}, error: (err) => console.error(err) });
      e.configure(config);
      return e;
    });
    const t = performance.now();
    const per = Math.ceil(n / lanes);
    await Promise.all(encoders.map(async (enc, k) => {
      for (let i = 0; i < per; i++) {
        const idx = k * per + i;
        if (idx >= n) break;
        let frame: VideoFrame;
        if (source === 'buffer') {
          frame = new VideoFrame(new Uint8Array(rgba[idx % rgba.length]), { format: 'RGBA', codedWidth: outW, codedHeight: outH, timestamp: i * 33333, duration: 33333 });
        } else {
          painter.paint(frameSpec(ctx, idx / fps));
          frame = new VideoFrame(canvas, { timestamp: i * 33333, duration: 33333 });
        }
        while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
        enc.encode(frame, { keyFrame: i % 60 === 0 });
        frame.close();
      }
      await enc.flush();
      enc.close();
    }));
    return +(n / ((performance.now() - t) / 1000)).toFixed(1);
  };
  out.canvas1 = await run(1, 'canvas');
  out.canvas2 = await run(2, 'canvas');
  out.canvas3 = await run(3, 'canvas');
  out.buffer1 = await run(1, 'buffer');
  out.buffer2 = await run(2, 'buffer');
  out.buffer3 = await run(3, 'buffer');
  out.cores = navigator.hardwareConcurrency;
  return out;
}
