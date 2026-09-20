// Mixes every clip into one PCM buffer using the browser's own audio engine
// (OfflineAudioContext), reusing the exact volume/fade scheduling the preview
// uses. The encoders then only ever see uncompressed PCM — no WebM/Opus/MP3
// demuxing inside the WASM build, and export audio matches playback exactly.

import type { AudioClip } from '../types';
import { getSource } from '../store/audioSources';
import { scheduleGain } from './audioEngine';

export const MIX_SAMPLE_RATE = 48000;

/** All audible clips rendered into one stereo buffer, or null when there is nothing to hear. */
export async function mixdownBuffer(clips: AudioClip[], duration: number): Promise<AudioBuffer | null> {
  const anySolo = clips.some((c) => c.solo);
  const live = clips.filter((c) => !c.muted && (!anySolo || c.solo) && c.duration > 0 && getSource(c.sourceId));
  if (live.length === 0) return null;
  const frames = Math.max(1, Math.ceil(duration * MIX_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, frames, MIX_SAMPLE_RATE);

  for (const clip of live) {
    const source = getSource(clip.sourceId)!;
    if (clip.startTime >= duration) continue;
    const src = ctx.createBufferSource();
    src.buffer = source.buffer;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    scheduleGain(gain, clip, clip.startTime, 0);
    const len = Math.min(clip.duration, duration - clip.startTime, source.duration - clip.offset);
    if (len <= 0) continue;
    src.start(clip.startTime, clip.offset, len);
  }

  return ctx.startRendering();
}

/** Convenience for the ffmpeg fallback: the mix as a 16-bit PCM WAV file. */
export async function mixdownWav(clips: AudioClip[], duration: number): Promise<Uint8Array | null> {
  const buffer = await mixdownBuffer(clips, duration);
  return buffer ? encodeWav(buffer) : null;
}

/** 16-bit PCM WAV. */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const bytesPerSample = 2;
  const dataSize = n * ch * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const v = new DataView(out);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * ch * bytesPerSample, true);
  v.setUint16(32, ch * bytesPerSample, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataSize, true);
  const chans = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out);
}
