// Offline audio utilities: loudness normalisation, a basic noise clean-up
// (high-pass + gate), speech segmentation for "fit to narration", and a
// small library of synthesised sound effects (no sample files to license).

import { encodeWav } from './audioMix';
import { decodeToSource } from '../store/audioSources';
import type { AudioSource } from '../types';

const SR = 48000;

/** Peak sample magnitude in a region of a buffer. */
export function peakOf(buffer: AudioBuffer, from = 0, to = buffer.duration): number {
  let peak = 0;
  const a = Math.max(0, Math.floor(from * buffer.sampleRate));
  const b = Math.min(buffer.length, Math.ceil(to * buffer.sampleRate));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  return peak;
}

/** Volume multiplier that brings the region's peak to `target` (clamped to the clip range). */
export function normalizeGain(buffer: AudioBuffer, from: number, to: number, target = 0.9): number {
  const peak = peakOf(buffer, from, to);
  if (peak < 1e-4) return 1;
  return Math.min(1.5, Math.max(0.05, target / peak));
}

/** Render a processed copy of a source as a new AudioSource. */
async function renderSource(
  src: AudioSource,
  name: string,
  build: (ctx: OfflineAudioContext, input: AudioBufferSourceNode) => AudioNode,
  post?: (rendered: AudioBuffer) => void,
): Promise<AudioSource> {
  const buffer = src.buffer;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const input = ctx.createBufferSource();
  input.buffer = buffer;
  build(ctx, input).connect(ctx.destination);
  input.start(0);
  const rendered = await ctx.startRendering();
  post?.(rendered);
  const wav = encodeWav(rendered);
  return decodeToSource(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), name);
}

/**
 * Basic noise clean-up for voice: high-pass at 90 Hz (rumble, desk thumps),
 * then a gate that ducks stretches quieter than the estimated noise floor.
 * Not spectral subtraction — hiss under speech stays — but it removes the
 * room noise between sentences, which is what people notice.
 */
export async function cleanVoice(src: AudioSource): Promise<AudioSource> {
  return renderSource(src, `${src.name} (clean)`, (ctx, input) => {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    hp.Q.value = 0.7;
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 180;
    lowShelf.gain.value = -2;
    input.connect(hp).connect(lowShelf);
    return lowShelf;
  }, (rendered) => applyGate(rendered));
}

/** In-place noise gate driven by short-window RMS with smooth attack/release. */
function applyGate(buffer: AudioBuffer): void {
  const win = Math.round(buffer.sampleRate * 0.02);
  const n = buffer.length;
  const mono = new Float32Array(Math.ceil(n / win));
  for (let w = 0; w < mono.length; w++) {
    let acc = 0, cnt = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) { acc += d[i] * d[i]; cnt++; }
    }
    mono[w] = cnt ? Math.sqrt(acc / cnt) : 0;
  }
  const sorted = Array.from(mono).filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length < 10) return;
  const floor = sorted[Math.floor(sorted.length * 0.12)];
  const threshold = Math.max(floor * 2.2, 0.004);
  // per-window target gain, then smoothed (fast attack, slower release)
  const gains = new Float32Array(mono.length);
  let g = 1;
  for (let w = 0; w < mono.length; w++) {
    const target = mono[w] >= threshold ? 1 : 0.08;
    g += (target - g) * (target > g ? 0.6 : 0.25);
    gains[w] = g;
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const w = Math.floor(i / win);
      const next = Math.min(mono.length - 1, w + 1);
      const f = (i - w * win) / win;
      d[i] *= gains[w] * (1 - f) + gains[next] * f;
    }
  }
}

// --- narration -------------------------------------------------------------

export interface SpeechSegment { start: number; end: number }

/**
 * Split speech into phrases at pauses of at least `minPause` seconds.
 * Times are relative to the buffer start.
 */
export function speechSegments(buffer: AudioBuffer, from = 0, to = buffer.duration, minPause = 0.35): SpeechSegment[] {
  const win = 0.02;
  const size = Math.round(buffer.sampleRate * win);
  const a = Math.floor(from * buffer.sampleRate), b = Math.min(buffer.length, Math.ceil(to * buffer.sampleRate));
  const d = buffer.getChannelData(0);
  const rms: number[] = [];
  for (let i = a; i < b; i += size) {
    let acc = 0;
    const end = Math.min(b, i + size);
    for (let j = i; j < end; j++) acc += d[j] * d[j];
    rms.push(Math.sqrt(acc / Math.max(1, end - i)));
  }
  const sorted = [...rms].sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const threshold = Math.max(floor * 2.5, loud * 0.12, 0.004);
  const segs: SpeechSegment[] = [];
  let cur: SpeechSegment | null = null;
  let quiet = 0;
  rms.forEach((v, i) => {
    const t = from + i * win;
    if (v >= threshold) {
      if (!cur) cur = { start: t, end: t + win };
      else if (quiet * win >= minPause) { segs.push(cur); cur = { start: t, end: t + win }; }
      else cur.end = t + win;
      quiet = 0;
    } else {
      quiet++;
    }
  });
  if (cur) segs.push(cur);
  return segs.filter((s) => s.end - s.start >= 0.25);
}

// --- synthesised sound effects ---------------------------------------------

export interface SfxDef { id: string; name: string; seconds: number }

export const SFX: SfxDef[] = [
  { id: 'pop', name: 'Pop', seconds: 0.25 },
  { id: 'click', name: 'Click', seconds: 0.12 },
  { id: 'whoosh', name: 'Whoosh', seconds: 0.6 },
  { id: 'swish', name: 'Swish (short)', seconds: 0.3 },
  { id: 'ding', name: 'Ding', seconds: 1.2 },
  { id: 'chime', name: 'Chime (two notes)', seconds: 1.4 },
  { id: 'scribble', name: 'Pen scribble', seconds: 1.0 },
  { id: 'erase', name: 'Eraser rub', seconds: 0.9 },
  { id: 'drum', name: 'Drum hit', seconds: 0.5 },
  { id: 'rise', name: 'Rising tone', seconds: 0.8 },
  { id: 'success', name: 'Success', seconds: 1.0 },
  { id: 'error', name: 'Wrong buzz', seconds: 0.6 },
];

/** Deterministic noise source (same effect every time, and in every export). */
function noise(ctx: OfflineAudioContext, seconds: number, seed = 1): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed;
  for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(ctx: OfflineAudioContext, type: OscillatorType, f0: number, f1: number, t0: number, t1: number, peak: number, out: AudioNode): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t1 + 0.02);
}

function filteredNoise(ctx: OfflineAudioContext, seconds: number, type: BiquadFilterType, f0: number, f1: number, peak: number, out: AudioNode, seed = 3): void {
  const n = noise(ctx, seconds, seed);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, 0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(peak, seconds * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, seconds);
  n.connect(f).connect(g).connect(out);
  n.start(0);
}

export async function renderSfx(id: string): Promise<AudioBuffer> {
  const def = SFX.find((s) => s.id === id) ?? SFX[0];
  const ctx = new OfflineAudioContext(1, Math.ceil(def.seconds * SR), SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  switch (def.id) {
    case 'pop': tone(ctx, 'sine', 600, 150, 0, 0.22, 0.8, out); break;
    case 'click': filteredNoise(ctx, 0.12, 'bandpass', 3000, 1200, 0.9, out); break;
    case 'whoosh': filteredNoise(ctx, 0.6, 'bandpass', 300, 2400, 0.7, out); break;
    case 'swish': filteredNoise(ctx, 0.3, 'highpass', 800, 4000, 0.6, out, 7); break;
    case 'ding': tone(ctx, 'sine', 1320, 1300, 0, 1.2, 0.5, out); tone(ctx, 'sine', 2640, 2600, 0, 0.6, 0.15, out); break;
    case 'chime': tone(ctx, 'sine', 880, 870, 0, 0.9, 0.45, out); tone(ctx, 'sine', 1320, 1310, 0.35, 1.4, 0.4, out); break;
    case 'scribble': {
      // one long scratchy noise with a fast tremolo, like a felt tip going back and forth
      const n = noise(ctx, 1.0, 5);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0;
      for (let i = 0; i < 12; i++) { g.gain.setValueAtTime(0.5, i * 0.08); g.gain.linearRampToValueAtTime(0.05, i * 0.08 + 0.06); }
      n.connect(f).connect(g).connect(out); n.start(0);
      break;
    }
    case 'erase': {
      const n = noise(ctx, 0.9, 9);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0;
      for (let i = 0; i < 5; i++) { g.gain.setValueAtTime(0.05, i * 0.18); g.gain.linearRampToValueAtTime(0.6, i * 0.18 + 0.09); g.gain.linearRampToValueAtTime(0.05, i * 0.18 + 0.18); }
      n.connect(f).connect(g).connect(out); n.start(0);
      break;
    }
    case 'drum': tone(ctx, 'sine', 150, 45, 0, 0.45, 1, out); filteredNoise(ctx, 0.12, 'lowpass', 1500, 300, 0.4, out); break;
    case 'rise': tone(ctx, 'triangle', 300, 1200, 0, 0.8, 0.5, out); break;
    case 'success': tone(ctx, 'sine', 660, 655, 0, 0.3, 0.5, out); tone(ctx, 'sine', 880, 875, 0.18, 0.5, 0.5, out); tone(ctx, 'sine', 1320, 1310, 0.36, 1.0, 0.5, out); break;
    case 'error': tone(ctx, 'square', 180, 120, 0, 0.55, 0.25, out); break;
  }
  return ctx.startRendering();
}

/** Render an effect and register it as a source (WAV kept for persistence). */
export async function sfxSource(id: string): Promise<AudioSource> {
  const def = SFX.find((s) => s.id === id) ?? SFX[0];
  const buffer = await renderSfx(def.id);
  const wav = encodeWav(buffer);
  return decodeToSource(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), def.name);
}

/** Play an effect once, right now (preview). */
export async function previewSfx(id: string, ctx: AudioContext): Promise<void> {
  const buffer = await renderSfx(id);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  await ctx.resume();
  src.start();
}
