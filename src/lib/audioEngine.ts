// Web Audio playback synced to the playback clock. Every clip that overlaps
// the play range is scheduled up front with its own gain node (volume,
// fades); the clock starts/stops the whole set around the store's currentTime.

import type { AudioClip, AudioSource } from '../types';
import { audioContext, getSource } from '../store/audioSources';

interface Voice { src: AudioBufferSourceNode; gain: GainNode; clipId: string }
let voices: Voice[] = [];

/** Start all clips so that they line up with timeline position t (seconds). */
export function startAudio(clips: AudioClip[], t: number): void {
  stopAudio();
  const ac = audioContext();
  void ac.resume();
  const now = ac.currentTime;

  for (const clip of clips) {
    if (clip.muted || clip.duration <= 0) continue;
    const source = getSource(clip.sourceId);
    if (!source) continue;
    const rel = t - clip.startTime; // position within the clip
    if (rel >= clip.duration) continue;

    const src = ac.createBufferSource();
    src.buffer = source.buffer;
    const gain = ac.createGain();
    src.connect(gain).connect(ac.destination);

    const startAt = rel >= 0 ? now : now - rel; // ac time when the clip (re)starts
    const offset = clip.offset + Math.max(rel, 0);
    const remaining = clip.duration - Math.max(rel, 0);
    scheduleGain(gain, clip, startAt, Math.max(rel, 0));
    src.start(startAt, offset, remaining);
    voices.push({ src, gain, clipId: clip.id });
  }
}

/** Volume envelope: fade in/out expressed on the AudioContext clock. */
function scheduleGain(gain: GainNode, clip: AudioClip, startAt: number, skipped: number): void {
  const v = clip.volume;
  const g = gain.gain;
  g.cancelScheduledValues(0);
  const fiEnd = clip.fadeIn - skipped;          // seconds after startAt when fade-in ends
  const foStart = clip.duration - clip.fadeOut - skipped;
  let initial = v;
  if (clip.fadeIn > 0 && skipped < clip.fadeIn) initial = (v * skipped) / clip.fadeIn;
  g.setValueAtTime(initial, startAt);
  if (fiEnd > 0) g.linearRampToValueAtTime(v, startAt + fiEnd);
  if (clip.fadeOut > 0 && foStart > 0) {
    g.setValueAtTime(v, startAt + foStart);
    g.linearRampToValueAtTime(0, startAt + foStart + clip.fadeOut);
  } else if (clip.fadeOut > 0 && foStart <= 0) {
    // we started inside the fade-out
    const into = -foStart;
    g.setValueAtTime(Math.max(0, v * (1 - into / clip.fadeOut)), startAt);
    g.linearRampToValueAtTime(0, startAt + (clip.fadeOut - into));
  }
}

export function stopAudio(): void {
  for (const v of voices) {
    try { v.src.stop(); } catch { /* already stopped */ }
    v.src.disconnect();
    v.gain.disconnect();
  }
  voices = [];
}

/** Live volume change while playing (fades are re-applied on the next play). */
export function setClipVolume(clipId: string, volume: number): void {
  const v = voices.find((x) => x.clipId === clipId);
  if (v) v.gain.gain.setTargetAtTime(volume, audioContext().currentTime, 0.02);
}

/**
 * Peak amplitudes (0..1) for drawing a waveform: `columns` values covering
 * the source from `from` to `to` seconds.
 */
export function waveformPeaks(source: AudioSource, from: number, to: number, columns: number): Float32Array {
  const out = new Float32Array(columns);
  const buffer = source.buffer;
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
