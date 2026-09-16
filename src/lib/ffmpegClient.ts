// Lazy singleton ffmpeg.wasm loader (spec §8): loading at app start would
// tank first paint (it's multi-MB), so it loads on first export and is cached.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Served from our own origin (public/ffmpeg) rather than a CDN: the desktop
// build has no network guarantee, and same-origin sidesteps COEP entirely.
const CORE_BASE = '/ffmpeg';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      instance = ffmpeg;
      return ffmpeg;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}
