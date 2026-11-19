// Video clips on the board. Like a GIF, a clip is a picture element whose
// pixels change with time: its `image` is the poster frame (thumbnails, Edit
// view), and `video` says which second of the clip shows at each moment.
//
// The live board plays the clip in a <video> while the preview runs, and seeks
// it while scrubbing. Seeking and waiting for "seeked" gives the exact frame
// (measured: 0 wrong frames in 360 seeks), so snapshots are a pure function of
// time like everything else.
//
// An export asks for every frame in time order, and a seek decodes again from
// the last keyframe each time: a 1080p clip exported at about 6 frames a second
// with the CPU flat out. So the export reads each clip in one pass instead
// (ClipStream: WebCodecs, on the graphics card's decoder where there is one),
// and seeks the <video> only for a file that pass can't read.

import type { DrawElement, VideoRef } from '../types';
import type { VideoSample, VideoSampleSink } from 'mediabunny';

/** Bigger files make a project slow to save and to open. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function isVideoFile(file: File): boolean {
  return /^video\//i.test(file.type) || /\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name);
}

export const isVideoSrc = (src: string | undefined): src is string => !!src && src.startsWith('data:video/');

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The second of the clip that shows `clock` seconds after the element first
 * appears. It plays from `start`; at the end it loops, or holds the last frame.
 * Not rounded: a frame starts at k/30 s, which no rounding would hit.
 */
export function mediaTime(v: VideoRef, clock: number): number {
  const dur = Math.max(0.002, v.duration);
  const start = Math.min(Math.max(0, v.start ?? 0), dur - 0.002);
  const span = dur - start;
  const c = Math.max(0, clock);
  const into = v.loop ? c % span : Math.min(c, span - 0.001);
  return start + Math.max(0, into);
}

/**
 * Where to seek for the frame showing at `t`: a hair later, so a time on a
 * frame's very start (an export frame lands on one at every step) gets that
 * frame, never the one before it.
 */
function seekTarget(t: number, duration: number): number {
  return Math.min(t + 2e-4, Math.max(0, duration - 0.001));
}

// --- the file behind a clip -------------------------------------------------

const blobs = new Map<string, Promise<Blob>>();

function blobFor(src: string): Promise<Blob> {
  let b = blobs.get(src);
  if (!b) {
    b = fetch(src).then((r) => r.blob());
    blobs.set(src, b);
  }
  return b;
}

/** Forget the files of clips no longer on the board. */
export function releaseVideos(inUse: (string | undefined)[]): void {
  const keep = new Set(inUse.filter(isVideoSrc));
  for (const src of blobs.keys()) if (!keep.has(src)) blobs.delete(src);
}

function wait(el: HTMLVideoElement, ok: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms); // a stuck decoder must not hang an export
    function done() { clearTimeout(timer); el.removeEventListener(ok, done); el.removeEventListener('error', fail); resolve(); }
    function fail() { clearTimeout(timer); el.removeEventListener(ok, done); el.removeEventListener('error', fail); reject(new Error(el.error?.message || 'This video could not be played.')); }
    el.addEventListener(ok, done, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

/** One hidden <video> that seeks to exact frames, one request at a time. */
class VideoReader {
  readonly el: HTMLVideoElement;
  private readonly url: Promise<string>;
  private ready: Promise<void>;
  private at = Number.NaN;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(src: string) {
    const el = document.createElement('video');
    el.muted = true;
    el.preload = 'auto';
    el.playsInline = true;
    this.el = el;
    this.url = blobFor(src).then((b) => URL.createObjectURL(b));
    this.ready = this.url.then((u) => {
      const loaded = wait(el, 'loadeddata', 20000);
      el.src = u;
      return loaded;
    });
  }

  /** Seek to `t` seconds; resolves once that frame can be drawn. */
  seek(t: number): Promise<HTMLVideoElement> {
    const job = this.queue.then(async () => {
      await this.ready;
      if (Math.abs(this.at - t) < 1e-6) return this.el;
      const seeked = wait(this.el, 'seeked', 5000);
      this.el.currentTime = t;
      await seeked;
      this.at = t;
      return this.el;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  close(): void {
    void this.url.then((u) => URL.revokeObjectURL(u));
    this.el.removeAttribute('src');
    this.el.load();
  }
}

/**
 * One clip decoded in time order with WebCodecs. Asked for times that go
 * forward, it decodes each frame once (a few ahead, in the background) and
 * draws only the frame that shows at the time asked for. A time earlier than
 * the last one (a loop starting over) or far ahead starts a new pass there.
 * The frame is kept on a canvas of its own: rotation and flip are applied, and
 * it stays valid until the next request.
 */
class ClipStream {
  private readonly ready: Promise<VideoSampleSink | null>;
  private dispose: (() => void) | null = null;
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private ahead: VideoSample | null = null;
  private ended = false;
  private lastT = Number.NaN;
  private canvas: OffscreenCanvas | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(src: string) {
    this.ready = (async () => {
      if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
      const mb = await import('mediabunny');
      const input = new mb.Input({ source: new mb.BlobSource(await blobFor(src)), formats: mb.ALL_FORMATS });
      this.dispose = () => input.dispose();
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) return null;
      return new mb.VideoSampleSink(track);
    })().catch((e) => {
      console.warn('[video] cannot read this clip in one pass; seeking it instead', e);
      return null;
    });
  }

  /** A canvas showing the frame at `t` seconds; null when this clip can't be read in one pass here. */
  frameAt(t: number): Promise<OffscreenCanvas | null> {
    const job = this.queue.then(() => this.advance(t));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async advance(t: number): Promise<OffscreenCanvas | null> {
    const sink = await this.ready;
    if (!sink) return null;
    let pending: VideoSample | null = null;
    try {
      if (!this.iter || !(t >= this.lastT) || t - this.lastT > 3) {
        await this.stop();
        this.iter = sink.samples(t);
        const first = await this.iter.next(); // the frame showing at t (or the first one, before it)
        if (first.done) this.ended = true;
        else pending = first.value;
      }
      this.lastT = t;
      for (;;) {
        if (!this.ahead && !this.ended) {
          const r = await this.iter.next();
          if (r.done) this.ended = true;
          else this.ahead = r.value;
        }
        if (!this.ahead || this.ahead.timestamp > t) break;
        pending?.close();
        pending = this.ahead;
        this.ahead = null;
      }
      if (pending) {
        const w = pending.displayWidth, h = pending.displayHeight;
        if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) this.canvas = new OffscreenCanvas(w, h);
        const g = this.canvas.getContext('2d');
        if (!g) return null;
        g.clearRect(0, 0, w, h);
        pending.draw(g, 0, 0, w, h);
      }
      return this.canvas;
    } finally {
      pending?.close();
    }
  }

  private async stop(): Promise<void> {
    this.ahead?.close();
    this.ahead = null;
    this.ended = false;
    const it = this.iter;
    this.iter = null;
    if (it) await it.return().catch(() => undefined);
  }

  close(): void {
    void this.queue.then(async () => {
      await this.stop();
      this.dispose?.();
    });
  }
}

/** What a renderer needs to know about a clip: the element and its clock. */
export interface ClipAt { el: DrawElement; clock: number }

/**
 * Exact frames for one renderer (each export lane has its own, so lanes never
 * wait on each other's decoders or seeks).
 */
export class VideoFrames {
  private readers = new Map<string, VideoReader>();
  private streams = new Map<string, ClipStream>();
  private canvas: HTMLCanvasElement | null = null;
  private cache = new Map<string, string>();

  private reader(el: DrawElement): VideoReader {
    let r = this.readers.get(el.id);
    if (!r) {
      r = new VideoReader(el.video!.src);
      this.readers.set(el.id, r);
    }
    return r;
  }

  private stream(el: DrawElement): ClipStream {
    let s = this.streams.get(el.id);
    if (!s) {
      s = new ClipStream(el.video!.src);
      this.streams.set(el.id, s);
    }
    return s;
  }

  /** Each clip's frame for this moment (for a canvas painter): read in one pass, or by seeking its <video>. */
  async frames(clips: ClipAt[]): Promise<Map<string, CanvasImageSource>> {
    const out = new Map<string, CanvasImageSource>();
    for (const { el, clock } of clips) {
      if (!el.video) continue;
      const t = seekTarget(mediaTime(el.video, clock), el.video.duration);
      try {
        out.set(el.id, (await this.stream(el).frameAt(t)) ?? (await this.reader(el).seek(t)));
      } catch (e) {
        console.warn('[video] frame unavailable, showing the poster', e);
      }
    }
    return out;
  }

  /** The frame of each clip as a data: URL (for the SVG renderer, which can't load anything else). */
  async urls(clips: ClipAt[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const { el, clock } of clips) {
      if (!el.video || !el.image) continue;
      const t = seekTarget(mediaTime(el.video, clock), el.video.duration);
      const key = `${el.id}@${t.toFixed(5)}`;
      let url = this.cache.get(key);
      if (!url) {
        try {
          const v = await this.reader(el).seek(t);
          url = snapshot(v, (this.canvas ??= document.createElement('canvas')), 1920, 0.92);
        } catch (e) {
          console.warn('[video] frame unavailable, showing the poster', e);
          continue;
        }
        if (this.cache.size > 24) this.cache.clear();
        this.cache.set(key, url);
      }
      out.set(el.id, url);
    }
    return out;
  }

  close(): void {
    for (const r of this.readers.values()) r.close();
    for (const s of this.streams.values()) s.close();
    this.readers.clear();
    this.streams.clear();
    this.cache.clear();
  }
}

function fitSize(w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function snapshot(v: HTMLVideoElement, canvas: HTMLCanvasElement, maxSide: number, quality: number): string {
  const { w, h } = fitSize(v.videoWidth, v.videoHeight, maxSide);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.getContext('2d')!.drawImage(v, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// --- bringing a clip in -------------------------------------------------------

export interface LoadedVideo {
  src: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

const MIME_BY_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg' };

/** Read a video file, check it plays here, and take its poster frame. */
export async function loadVideoFile(file: Blob & { name?: string }): Promise<LoadedVideo> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`This video is ${Math.round(file.size / 1048576)} MB; DrawFlow takes videos up to ${MAX_VIDEO_BYTES / 1048576} MB. Trim it or export it smaller first.`);
  }
  const ext = (file.name ?? '').toLowerCase().match(/\.(\w+)$/)?.[1] ?? '';
  const type = /^video\//.test(file.type) ? file.type : MIME_BY_EXT[ext] ?? 'video/mp4';
  const src = await readAsDataUrl(new Blob([file], { type }));
  const info = await probe(src);
  return { src, ...info };
}

/** Size, length, sound and the frame at `at` seconds of a clip. */
export async function probe(src: string, at = 0): Promise<Omit<LoadedVideo, 'src'>> {
  const el = document.createElement('video');
  el.muted = true;
  el.preload = 'auto';
  const url = URL.createObjectURL(await blobFor(src));
  try {
    const loaded = wait(el, 'loadeddata', 20000);
    el.src = url;
    await loaded.catch(() => { throw new Error("This video can't be played here. Save it as an MP4 (H.264) or WebM and try again."); });
    if (!el.videoWidth || !el.videoHeight) throw new Error('This file has no picture track.');
    let duration = el.duration;
    if (!Number.isFinite(duration)) {
      // some WebM files only learn their length once played to the end
      el.currentTime = 1e9;
      await wait(el, 'seeked', 5000);
      duration = el.currentTime || el.duration;
    }
    if (!(duration > 0)) throw new Error('This video has no length.');
    const seeked = wait(el, 'seeked', 5000);
    el.currentTime = Math.min(at, Math.max(0, duration - 0.001));
    await seeked;
    const poster = snapshot(el, document.createElement('canvas'), 1920, 0.9);
    const media = el as HTMLVideoElement & { audioTracks?: { length: number }; mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number };
    const hasAudio = media.audioTracks ? media.audioTracks.length > 0 : true;
    return { poster, width: el.videoWidth, height: el.videoHeight, duration: round3(duration), hasAudio };
  } finally {
    el.removeAttribute('src');
    el.load();
    URL.revokeObjectURL(url);
  }
}

// --- the live board -----------------------------------------------------------

const listeners = new Set<() => void>();
/** Called whenever a clip on the live board has a new frame to show. */
export function onLiveFrame(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const notify = () => listeners.forEach((fn) => fn());

/**
 * Plays one clip for the live board: really playing while the preview runs,
 * seeking to the exact frame while paused or scrubbing.
 */
class LivePlayer {
  readonly el: HTMLVideoElement;
  /** the frame to show (a blob: URL the board's <image> can use) */
  href: string | null = null;
  private shownAt = Number.NaN;
  private canvas = document.createElement('canvas');
  private urls: string[] = [];
  private seeking = false;
  private wanted = Number.NaN;
  private playing = false;
  private ready = false;
  private lastCapture = 0;
  private closed = false;

  constructor(src: string) {
    const el = document.createElement('video');
    el.muted = true;
    el.preload = 'auto';
    el.playsInline = true;
    this.el = el;
    void blobFor(src).then((b) => {
      if (this.closed) return;
      el.src = URL.createObjectURL(b);
      el.addEventListener('loadeddata', () => { this.ready = true; this.apply(); }, { once: true });
    });
  }

  want(t: number, playing: boolean): void {
    this.wanted = t;
    this.playing = playing;
    if (this.ready) this.apply();
  }

  private apply(): void {
    const el = this.el;
    if (this.playing) {
      if (el.paused) {
        el.currentTime = this.wanted;
        void el.play().catch(() => undefined);
        this.watch();
      } else if (Math.abs(el.currentTime - this.wanted) > 0.3) {
        el.currentTime = this.wanted;
      }
      return;
    }
    if (!el.paused) el.pause();
    if (this.seeking || Math.abs(this.shownAt - this.wanted) < 1e-3) return;
    this.seeking = true;
    const target = this.wanted;
    const done = () => {
      this.seeking = false;
      if (this.closed) return;
      void this.capture(target);
      if (!this.playing && Math.abs(this.wanted - target) >= 1e-3) this.apply();
    };
    el.addEventListener('seeked', done, { once: true });
    el.currentTime = target;
  }

  /** While playing, take each frame the decoder presents. */
  private watch(): void {
    const el = this.el as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const step = () => {
      if (this.closed || el.paused || !this.playing) return;
      const now = performance.now();
      if (now - this.lastCapture > 30) { this.lastCapture = now; void this.capture(el.currentTime); }
      if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    step();
  }

  private async capture(at: number): Promise<void> {
    const el = this.el;
    if (!el.videoWidth) return;
    const { w, h } = fitSize(el.videoWidth, el.videoHeight, 1280);
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    c.getContext('2d')!.drawImage(el, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || this.closed) return;
    const url = URL.createObjectURL(blob);
    this.urls.push(url);
    // the board may still be decoding the previous frame: let a few go before freeing them
    while (this.urls.length > 4) URL.revokeObjectURL(this.urls.shift()!);
    this.href = url;
    this.shownAt = at;
    notify();
  }

  close(): void {
    this.closed = true;
    const src = this.el.src;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }
}

const live = new Map<string, { src: string; player: LivePlayer }>();

/**
 * Bring the live board's clips to these moments. Clips not listed are
 * stopped and forgotten. Returns each clip's frame to show (or none yet).
 */
export function syncLiveVideos(clips: { el: DrawElement; clock: number }[], playing: boolean): Map<string, string> {
  const seen = new Set<string>();
  const out = new Map<string, string>();
  for (const { el, clock } of clips) {
    if (!el.video) continue;
    seen.add(el.id);
    let entry = live.get(el.id);
    if (entry && entry.src !== el.video.src) { entry.player.close(); entry = undefined; }
    if (!entry) {
      entry = { src: el.video.src, player: new LivePlayer(el.video.src) };
      live.set(el.id, entry);
    }
    entry.player.want(seekTarget(mediaTime(el.video, clock), el.video.duration), playing);
    if (entry.player.href) out.set(el.id, entry.player.href);
  }
  for (const [id, entry] of live) {
    if (seen.has(id)) continue;
    entry.player.close();
    live.delete(id);
  }
  return out;
}

/** The frame each live clip shows now, without moving anything. */
export function liveVideoFrames(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, { player }] of live) if (player.href) out.set(id, player.href);
  return out;
}
