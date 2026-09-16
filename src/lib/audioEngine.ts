// Web Audio playback synced to the playback clock. One source at a time;
// the clock starts/stops it around the store's currentTime. The clip on the
// timeline is the file minus its trims, positioned at track.startTime.

import type { AudioTrack } from '../types';

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Length of the clip as it appears on the timeline. */
export function clipLength(track: AudioTrack): number {
  return Math.max(0, track.duration - track.trimStart - track.trimEnd);
}

/** Start the track so that it lines up with timeline position t (seconds). */
export function startAudio(track: AudioTrack | null, t: number): void {
  stopAudio();
  if (!track?.buffer) return;
  const len = clipLength(track);
  if (len <= 0) return;
  const ac = getCtx();
  void ac.resume();
  const src = ac.createBufferSource();
  src.buffer = track.buffer;
  const g = ac.createGain();
  g.gain.value = track.volume;
  src.connect(g).connect(ac.destination);

  const rel = t - track.startTime; // position within the clip
  if (rel >= len) return;
  if (rel >= 0) {
    src.start(0, track.trimStart + rel, len - rel);
  } else {
    src.start(ac.currentTime - rel, track.trimStart, len); // clip begins later
  }
  source = src;
  gain = g;
}

export function stopAudio(): void {
  if (source) {
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    source = null;
  }
  if (gain) {
    gain.disconnect();
    gain = null;
  }
}

/** Live volume change while playing. */
export function setAudioVolume(v: number): void {
  if (gain) gain.gain.value = v;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer();
  return getCtx().decodeAudioData(buf);
}

/**
 * Peak amplitudes (0..1) for drawing a waveform: `columns` values covering
 * the file from `from` to `to` seconds.
 */
export function waveformPeaks(buffer: AudioBuffer, from: number, to: number, columns: number): Float32Array {
  const out = new Float32Array(columns);
  const ch = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const start = Math.max(0, Math.floor(from * rate));
  const end = Math.min(ch.length, Math.floor(to * rate));
  const span = Math.max(1, end - start);
  const step = span / columns;
  for (let c = 0; c < columns; c++) {
    const s0 = start + Math.floor(c * step);
    const s1 = Math.min(end, start + Math.floor((c + 1) * step));
    let peak = 0;
    const stride = Math.max(1, Math.floor((s1 - s0) / 64));
    for (let i = s0; i < s1; i += stride) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
    out[c] = peak;
  }
  return out;
}
