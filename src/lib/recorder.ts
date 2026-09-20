// Voiceover recording: the scribe plays while the microphone records; the
// take is decoded and dropped on the Voiceover lane at the time recording
// started.

import { useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore';
import { decodeToSource } from '../store/audioSources';

interface RecState { active: boolean; startedAt: number; error: string | null }
let state: RecState = { active: false, startedAt: 0, error: null };
const listeners = new Set<() => void>();
function setState(next: Partial<RecState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export function useRecorder(): RecState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let unsubscribe: (() => void) | null = null;

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Start recording and play the scribe from the current playhead. */
export async function startRecording(): Promise<void> {
  if (state.active) return;
  setState({ error: null });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    setState({ error: e instanceof Error && e.name === 'NotAllowedError'
      ? 'Microphone access was blocked. Allow the microphone for this site and try again.'
      : 'No microphone available.' });
    return;
  }
  const s = useStore.getState();
  s.pause();
  const startedAt = s.currentTime >= s.project.duration - 1e-6 ? 0 : s.currentTime;
  chunks = [];
  const mime = pickMime();
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => void finish(startedAt);
  recorder.start(250);
  setState({ active: true, startedAt });
  // the scribe plays under the narration; muted music would be nicer but the
  // engine plays what's there — users can mute clips in the lane first
  s.setTime(startedAt);
  s.play();
  // stop automatically when playback finishes
  unsubscribe = useStore.subscribe((st, prev) => {
    if (prev.isPlaying && !st.isPlaying && state.active) stopRecording();
  });
}

export function stopRecording(): void {
  if (!state.active) return;
  unsubscribe?.();
  unsubscribe = null;
  useStore.getState().pause();
  try { recorder?.stop(); } catch { /* noop */ }
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function finish(startedAt: number): Promise<void> {
  setState({ active: false });
  const type = recorder?.mimeType || 'audio/webm';
  recorder = null;
  const blob = new Blob(chunks, { type });
  chunks = [];
  if (blob.size < 200) {
    setState({ error: 'Nothing was recorded.' });
    return;
  }
  try {
    const n = useStore.getState().audioClips.filter((c) => c.lane === 'voice').length + 1;
    const source = await decodeToSource(blob, `Voiceover ${n}`);
    useStore.getState().addAudioClip({
      id: crypto.randomUUID(),
      name: source.name,
      lane: 'voice',
      sourceId: source.id,
      startTime: startedAt,
      offset: 0,
      duration: source.duration,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      muted: false,
    }, { overwrite: true });
  } catch {
    setState({ error: 'Could not decode the recording.' });
  }
}
