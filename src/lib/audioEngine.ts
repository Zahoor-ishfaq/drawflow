// Web Audio playback synced to the playback clock. One source at a time;
// the clock starts/stops it around the store's currentTime.

import type { AudioTrack } from '../types';

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Start the track so that it lines up with timeline position t (seconds). */
export function startAudio(track: AudioTrack | null, t: number): void {
  stopAudio();
  if (!track?.buffer) return;
  const ac = getCtx();
  void ac.resume();
  const src = ac.createBufferSource();
  src.buffer = track.buffer;
  const g = ac.createGain();
  g.gain.value = track.volume;
  src.connect(g).connect(ac.destination);
  const rel = t - track.startTime; // position within the audio file
  if (rel >= track.buffer.duration) return;
  if (rel >= 0) src.start(0, rel);
  else src.start(ac.currentTime - rel, 0); // audio begins later on the timeline
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
