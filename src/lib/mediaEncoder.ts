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

  let audio: AudioEncoder | null = null;
  if (audioConfig) {
    audio = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta ?? {}),
      error: fail,
    });
    audio.configure(audioConfig);
  }

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
      if (!audio || !audioConfig) return;
      const channels = audioConfig.numberOfChannels;
      const rate = audioConfig.sampleRate;
      const total = buffer.length;
      const chunkFrames = Math.round(rate / 10); // 100 ms
      const chans = Array.from({ length: channels }, (_, c) =>
        buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
      for (let start = 0; start < total; start += chunkFrames) {
        if (failure) throw failure;
        await waitForQueue(() => audio!.encodeQueueSize);
        const n = Math.min(chunkFrames, total - start);
        const data = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++) data.set(chans[c].subarray(start, start + n), c * n);
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: rate,
          numberOfFrames: n,
          numberOfChannels: channels,
          timestamp: Math.round((start / rate) * 1e6),
          data,
        });
        try {
          audio.encode(ad);
        } finally {
          ad.close();
        }
      }
    },

    async finish() {
      if (video) await video.flush();
      if (audio) await audio.flush();
      if (failure) throw failure;
      video?.close();
      audio?.close();
      muxer.finalize();
      return new Uint8Array((muxer.target as Mp4Target | WebmTarget).buffer);
    },

    abort() {
      try { if (video && video.state !== 'closed') video.close(); } catch { /* noop */ }
      try { if (audio && audio.state !== 'closed') audio.close(); } catch { /* noop */ }
    },
  };
}
