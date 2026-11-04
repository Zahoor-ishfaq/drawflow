// Encoding with the browser's own codecs (WebCodecs) muxed straight into an
// MP4 or WebM — no ffmpeg in the loop. Video frames come straight off the
// canvas; audio is the mixed-down AudioBuffer. Everything reports what it
// could and couldn't do so the caller can fall back per-track (e.g. video via
// WebCodecs but audio attached by ffmpeg when the platform has no AAC encoder).

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';

export type ContainerFormat = 'mp4' | 'webm';

export interface EncodeSession {
  /** true when the session will also take audio via addAudio() */
  audioSupported: boolean;
  /** the encoder configuration in use (workers replicate it for segment encoding) */
  videoConfig: VideoEncoderConfig;
  /** keyframe interval in frames */
  keyEvery: number;
  /** submit the current canvas contents as frame `index` */
  addFrame(canvas: OffscreenCanvas | HTMLCanvasElement, index: number): Promise<void>;
  /** submit a ready-made frame (takes ownership and closes it) */
  addVideoFrame(frame: VideoFrame, index: number): Promise<void>;
  /** submit already-encoded chunks (from a worker), in timestamp order */
  addRawChunks(chunks: { type: 'key' | 'delta'; timestamp: number; duration: number; data: ArrayBuffer }[], description: ArrayBuffer | null): void;
  /** encode a whole mixed-down buffer (call once, after or during frames) */
  addAudio(buffer: AudioBuffer): Promise<void>;
  /** finish and return the complete file */
  finish(): Promise<Uint8Array>;
  abort(): void;
}

export interface SessionOptions {
  format: ContainerFormat;
  width: number;
  height: number;
  fps: number;
  /** set when the export has audio; the session decides if it can encode it */
  audio?: { sampleRate: number; channels: number };
}

function bitrateFor(width: number, height: number, fps: number): number {
  // whiteboard footage is mostly flat colour; this is generous
  const px = width * height * fps;
  return Math.round(Math.min(24e6, Math.max(2e6, px * 0.09)));
}

/** H.264 profile/level candidates, best first; the first the platform accepts wins. */
function h264Candidates(width: number, height: number): string[] {
  const px = width * height;
  const level = px <= 921_600 ? '1f' : px <= 2_073_600 ? '28' : px <= 3_686_400 ? '32' : '33';
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`, 'avc1.42E01E'];
}

/** Power-user overrides (e.g. {"latencyMode":"realtime"}) kept in localStorage. */
export function encoderTweaks(): Partial<VideoEncoderConfig> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('drawflow.encoder') : null;
    return raw ? (JSON.parse(raw) as Partial<VideoEncoderConfig>) : {};
  } catch {
    return {};
  }
}

async function pickVideoConfig(opts: SessionOptions): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const base = {
    width: opts.width,
    height: opts.height,
    framerate: opts.fps,
    bitrate: bitrateFor(opts.width, opts.height, opts.fps),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    ...encoderTweaks(),
  };
  const codecs = opts.format === 'mp4' ? h264Candidates(opts.width, opts.height) : ['vp09.00.10.08', 'vp8'];
  for (const codec of codecs) {
    const config = {
      ...base,
      codec,
      ...(codec.startsWith('avc1') ? { avc: { format: 'avc' } } : {}),
    } as VideoEncoderConfig;
    try {
      const s = await VideoEncoder.isConfigSupported(config);
      if (s.supported) return config;
    } catch { /* try the next one */ }
  }
  return null;
}

async function pickAudioConfig(opts: SessionOptions): Promise<AudioEncoderConfig | null> {
  if (!opts.audio || typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const { sampleRate, channels: numberOfChannels } = opts.audio;
  // AAC is the native MP4 codec but not every platform ships an encoder
  // (Linux Chrome doesn't); Opus-in-MP4 plays in every browser and VLC.
  const codecs = opts.format === 'mp4' ? ['mp4a.40.2', 'opus'] : ['opus'];
  for (const codec of codecs) {
    const config: AudioEncoderConfig = {
      codec, sampleRate, numberOfChannels, bitrate: codec === 'opus' ? 128_000 : 160_000,
    };
    try {
      const s = await AudioEncoder.isConfigSupported(config);
      if (s.supported) return config;
    } catch { /* next */ }
  }
  return null;
}

/** Loudest sample in the mix. */
function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  return peak;
}

/**
 * Decode encoded audio back and check no sample exceeds `limit` — a corrupt
 * frame decodes to values hundreds of times louder than the mix itself.
 * Resolves true when it cannot check (no AudioDecoder) or all is well.
 */
async function decodesWithin(encoded: { chunk: EncodedAudioChunk; meta: EncodedAudioChunkMetadata }[], config: AudioEncoderConfig, limit: number): Promise<boolean> {
  if (typeof AudioDecoder === 'undefined') return true;
  const dc = encoded.find((e) => e.meta.decoderConfig)?.meta.decoderConfig;
  let ok = true;
  let broken = false;
  const dec = new AudioDecoder({
    output: (d) => {
      try {
        const n = d.numberOfFrames;
        const plane = new Float32Array(n);
        for (let c = 0; c < d.numberOfChannels && ok; c++) {
          d.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
          for (let i = 0; i < n; i++) if (!(Math.abs(plane[i]) <= limit)) { ok = false; break; }
        }
      } finally {
        d.close();
      }
    },
    error: () => { broken = true; },
  });
  try {
    dec.configure({
      codec: dc?.codec ?? config.codec,
      sampleRate: dc?.sampleRate ?? config.sampleRate,
      numberOfChannels: dc?.numberOfChannels ?? config.numberOfChannels,
      ...(dc?.description ? { description: dc.description } : {}),
    });
    for (const { chunk } of encoded) dec.decode(chunk);
    await dec.flush();
  } catch {
    return true; // the check itself is unavailable: keep the encoding rather than fail the export
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
  return ok && !broken;
}

/**
 * Triangular dither at one 16-bit step (about -90 dB, far below hearing),
 * from a fixed-seed generator so the same project always encodes the same;
 * `variant` picks another sequence for a retry.
 */
function ditherNoise(variant = 0): () => number {
  let seed = 0x2545f491 + variant * 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => (next() - next()) / 32768;
}

/** Returns null when the browser can't encode video at all (caller uses ffmpeg). */
export async function createEncodeSession(opts: SessionOptions): Promise<EncodeSession | null> {
  const videoConfig = await pickVideoConfig(opts);
  if (!videoConfig) return null;
  const audioConfig = await pickAudioConfig(opts);
  const { width, height, fps } = opts;

  const isMp4 = opts.format === 'mp4';
  const vcodec = videoConfig.codec;
  const muxer = isMp4
    ? new Mp4Muxer({
        target: new Mp4Target(),
        video: { codec: 'avc', width, height, frameRate: fps },
        audio: audioConfig
          ? {
              codec: audioConfig.codec === 'opus' ? 'opus' : 'aac',
              sampleRate: audioConfig.sampleRate,
              numberOfChannels: audioConfig.numberOfChannels,
            }
          : undefined,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      })
    : new WebmMuxer({
        target: new WebmTarget(),
        video: { codec: vcodec.startsWith('vp09') ? 'V_VP9' : 'V_VP8', width, height, frameRate: fps },
        audio: audioConfig
          ? { codec: 'A_OPUS', sampleRate: audioConfig.sampleRate, numberOfChannels: audioConfig.numberOfChannels }
          : undefined,
        firstTimestampBehavior: 'offset',
      });

  let failure: Error | null = null;
  const fail = (e: unknown) => { failure = e instanceof Error ? e : new Error(String(e)); };

  // the main-thread encoder is only spun up if frames are submitted here
  // (segment-parallel export encodes in workers and sends chunks instead)
  let video: VideoEncoder | null = null;
  const videoEncoder = () => {
    if (!video) {
      video = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? {}),
        error: fail,
      });
      video.configure(videoConfig);
    }
    return video;
  };
  let rawDescription: ArrayBuffer | null = null;

  // audio is encoded in addAudio(), checked, and only then handed to the muxer
  let audio: AudioEncoder | null = null;

  /** The whole mix encoded once (100 ms pieces), with dither variant `attempt`; resolves with the chunks. */
  const encodeAudio = async (buffer: AudioBuffer, attempt: number) => {
    const config = audioConfig!;
    const out: { chunk: EncodedAudioChunk; meta: EncodedAudioChunkMetadata }[] = [];
    const enc = new AudioEncoder({ output: (chunk, meta) => out.push({ chunk, meta: meta ?? {} }), error: fail });
    audio = enc;
    enc.configure(config);
    const channels = config.numberOfChannels;
    const rate = config.sampleRate;
    const total = buffer.length;
    const chunkFrames = Math.round(rate / 10); // 100 ms
    const chans = Array.from({ length: channels }, (_, c) =>
      buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
    const dither = ditherNoise(attempt);
    for (let start = 0; start < total; start += chunkFrames) {
      if (failure) throw failure;
      await waitForQueue(() => enc.encodeQueueSize);
      const n = Math.min(chunkFrames, total - start);
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) data.set(chans[c].subarray(start, start + n), c * n);
      for (let i = 0; i < data.length; i++) data[i] += dither();
      const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((start / rate) * 1e6), data });
      try {
        enc.encode(ad);
      } finally {
        ad.close();
      }
    }
    await enc.flush();
    enc.close();
    if (failure) throw failure;
    return out;
  };

  const frameMicros = 1e6 / fps;
  const keyEvery = fps * 2;
  const waitForQueue = (size: () => number) =>
    new Promise<void>((resolve) => {
      const tick = () => (size() > 6 && !failure ? setTimeout(tick, 4) : resolve());
      tick();
    });

  return {
    audioSupported: !!audioConfig,
    videoConfig,
    keyEvery,

    async addFrame(canvas, index) {
      if (failure) throw failure;
      const enc = videoEncoder();
      await waitForQueue(() => enc.encodeQueueSize);
      const frame = new VideoFrame(canvas as unknown as CanvasImageSource, {
        timestamp: Math.round(index * frameMicros),
        duration: Math.round(frameMicros),
      });
      try {
        enc.encode(frame, { keyFrame: index % keyEvery === 0 });
      } finally {
        frame.close();
      }
    },

    async addVideoFrame(frame, index) {
      try {
        if (failure) throw failure;
        const enc = videoEncoder();
        await waitForQueue(() => enc.encodeQueueSize);
        enc.encode(frame, { keyFrame: index % keyEvery === 0 });
      } finally {
        frame.close();
      }
    },

    addRawChunks(chunks, description) {
      for (const c of chunks) {
        // the decoder config (avcC) rides along with the first chunk only
        // (VP9 has no out-of-band description; the muxer wants an object or nothing)
        let meta: EncodedVideoChunkMetadata = {};
        if (!rawDescription && description) {
          rawDescription = description;
          meta = { decoderConfig: { codec: videoConfig.codec, codedWidth: width, codedHeight: height, description } };
        }
        // the two muxers disagree on the signature: WebM has no duration argument
        if (isMp4) (muxer as Mp4Muxer<Mp4Target>).addVideoChunkRaw(new Uint8Array(c.data), c.type, c.timestamp, c.duration, meta);
        else (muxer as WebmMuxer<WebmTarget>).addVideoChunkRaw(new Uint8Array(c.data), c.type, c.timestamp, meta);
      }
    },

    async addAudio(buffer) {
      if (!audioConfig) return;
      // Windows' AAC encoder now and then writes a corrupt frame: a burst of
      // noise that makes some players stop. So the audio is encoded, decoded
      // back and checked; if a frame is broken it is encoded again with a
      // different (inaudible) dither, which moves the encoder off the bad path.
      const limit = Math.max(1.5, 2 * peakOf(buffer));
      for (let attempt = 0; attempt < 4; attempt++) {
        const encoded = await encodeAudio(buffer, attempt);
        const check = audioConfig.codec === 'opus' || attempt === 3 ? true : await decodesWithin(encoded, audioConfig, limit);
        if (check) {
          for (const { chunk, meta } of encoded) muxer.addAudioChunk(chunk, meta);
          return;
        }
        console.warn(`[export] the AAC encoder produced a corrupt frame (attempt ${attempt + 1}); encoding the audio again`);
      }
    },

    async finish() {
      if (video) await video.flush();
      if (failure) throw failure;
      video?.close();
      muxer.finalize();
      return new Uint8Array((muxer.target as Mp4Target | WebmTarget).buffer);
    },

    abort() {
      try { if (video && video.state !== 'closed') video.close(); } catch { /* noop */ }
      try { if (audio && audio.state !== 'closed') audio.close(); } catch { /* noop */ }
    },
  };
}
