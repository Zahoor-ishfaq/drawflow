// Text-to-speech and speech-to-text with the user's own keys. Anthropic has
// neither, so these use OpenAI, Groq (Orpheus) and Gemini — or, offline, a
// voice app on the user's computer that speaks OpenAI's /audio/speech.

import { getAiSettings, type AiSettings, type TextProvider } from './settings';

import { audioContext } from '../../store/audioSources';

const OPENAI = 'https://api.openai.com/v1';
const GROQ = 'https://api.groq.com/openai/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

export type CloudSpeechProvider = Exclude<TextProvider, 'anthropic'>;
/** 'kokoro' is the built-in offline voice (desktop app); 'local' is a voice app the user runs themselves. */
export type SpeechProvider = CloudSpeechProvider | 'kokoro' | 'local';

export interface VoiceDef { id: string; label: string }

export const SPEECH_LABELS: Record<SpeechProvider, string> = { openai: 'OpenAI', groq: 'Groq (Orpheus)', gemini: 'Gemini', kokoro: 'Built-in voice (offline)', local: 'Local voice app' };

/**
 * The built-in voice's speakers — Kokoro-82M's English voices rated C or
 * better by its authors, best first. The files ship with the desktop app
 * (keep in sync with VOICES in scripts/build-voice-worker.mjs).
 */
export const KOKORO_VOICES: VoiceDef[] = [
  ['af_heart', 'Heart — US female'], ['af_bella', 'Bella — US female'], ['am_michael', 'Michael — US male'],
  ['bf_emma', 'Emma — UK female'], ['bm_george', 'George — UK male'], ['af_nicole', 'Nicole — US female, soft'],
  ['am_fenrir', 'Fenrir — US male'], ['am_puck', 'Puck — US male'], ['bm_fable', 'Fable — UK male'],
  ['af_aoede', 'Aoede — US female'], ['af_kore', 'Kore — US female'], ['af_sarah', 'Sarah — US female'],
  ['bf_isabella', 'Isabella — UK female'], ['af_nova', 'Nova — US female'], ['af_alloy', 'Alloy — US female'],
].map(([id, label]) => ({ id, label }));

/** The built-in voice runs in the desktop app (natively, ~4× faster than it would in a page). */
export const hasBuiltInVoice = (): boolean => typeof window !== 'undefined' && !!window.drawflow?.voiceSpeak;

/** Voice services that can be used right now: cloud ones with a key, the built-in voice, the local app when it is switched on. */
export function speechProviders(s: AiSettings = getAiSettings()): SpeechProvider[] {
  const out: SpeechProvider[] = (['openai', 'groq', 'gemini'] as CloudSpeechProvider[]).filter((p) => s.keys[p]);
  if (hasBuiltInVoice()) out.push('kokoro');
  if (s.localVoice.enabled && s.localVoice.url.trim()) out.push('local');
  return out;
}

/** The key to send with a speech request ('' where none is needed). */
export function speechKey(p: SpeechProvider, s: AiSettings = getAiSettings()): string {
  return p === 'local' ? s.localVoice.key : p === 'kokoro' ? '' : s.keys[p];
}

/** The voices to offer for a service; the local app's come from the app itself or are typed in settings. */
export function voicesFor(p: SpeechProvider, s: AiSettings = getAiSettings()): VoiceDef[] {
  if (p === 'kokoro') return KOKORO_VOICES;
  if (p !== 'local') return TTS_MODELS[p].voices;
  const out = [...s.localVoice.voices];
  for (const name of s.localVoice.extraVoices.split(',').map((v) => v.trim()).filter(Boolean)) {
    if (!out.some((v) => v.id === name)) out.push({ id: name, label: name });
  }
  return out.length ? out : [{ id: 'default', label: 'Default voice' }];
}

export const TTS_MODELS: Record<CloudSpeechProvider, { model: string; voices: VoiceDef[] }> = {
  openai: {
    model: 'gpt-4o-mini-tts',
    voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1) })),
  },
  groq: {
    // Orpheus replaced PlayAI on Groq (PlayAI was retired); it takes at most 200 characters per request
    model: 'canopylabs/orpheus-v1-english',
    voices: [['troy', 'Troy (male)'], ['austin', 'Austin (male)'], ['daniel', 'Daniel (male)'], ['hannah', 'Hannah (female)'], ['autumn', 'Autumn (female)'], ['diana', 'Diana (female)']].map(([id, label]) => ({ id, label })),
  },
  gemini: {
    model: 'gemini-2.5-flash-preview-tts',
    voices: ['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus'].map((v) => ({ id: v, label: v })),
  },
};

async function readError(res: Response): Promise<string> {
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  try {
    const j = JSON.parse(body);
    const m = j.error?.message ?? j.message ?? j.error;
    // keep the provider's error code too (insufficient_quota, RESOURCE_EXHAUSTED…) — it tells the two "quota" cases apart
    const code = [j.error?.code, j.error?.type, j.error?.status].find((c) => typeof c === 'string' && !/^\d+$/.test(c));
    if (typeof m === 'string') return `${res.status}: ${m}${code ? ` [${code}]` : ''}`;
  } catch { /* not json */ }
  return `${res.status}: ${body.slice(0, 200) || res.statusText}`;
}

/** Wrap raw 16-bit PCM in a WAV header. */
function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Blob {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm as BlobPart], { type: 'audio/wav' });
}

/** Longest input one request may carry, per provider (Groq's Orpheus: 200 characters; local models stay steadier on shorter takes). */
const MAX_INPUT: Record<SpeechProvider, number> = { openai: 4000, groq: 200, gemini: 8000, kokoro: 400, local: 600 };

// --- local voice app -------------------------------------------------------

/** The local app's base address, trimmed; a bare host gets OpenAI's /v1. */
export function localBase(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/]+$/i.test(u) ? `${u}/v1` : u;
}

/**
 * A request to the local voice app. In the desktop app it is relayed by the
 * main process (the page's security policy only admits the cloud providers);
 * in a browser it is a plain fetch, which the app's CORS settings must allow.
 */
async function localFetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> {
  const relay = window.drawflow?.localFetch;
  if (!relay) return fetch(url, init);
  const r = await relay(url, init);
  if ('error' in r) throw r.unreachable ? new TypeError(r.error) : new Error(r.error);
  const empty = r.status === 204 || r.status === 205 || r.status === 304;
  return new Response(empty ? null : (r.body as BlobPart), { status: r.status, statusText: r.statusText, headers: { 'Content-Type': r.contentType } });
}

/** The voice app isn't there (not installed, not running, wrong address) — a setup matter, not an error. */
export function isLocalNotSetUp(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return e instanceof TypeError || /failed to fetch|econnrefused|networkerror|load failed|only addresses on this computer|not a valid address|^(404|405):/i.test(msg);
}

function localHeaders(key: string): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/**
 * Ask the local app for its voices. VoiceStudio answers GET /audio/voices
 * with {voices:[{voice_id,name,type}]}; others use {data:[{id,name}]} or a
 * plain list. Its OpenAI aliases (alloy, echo…) all mean "the default voice",
 * so they collapse into one entry. Resolves null when the app lists none.
 */
export async function listLocalVoices(url: string, key: string): Promise<VoiceDef[] | null> {
  const res = await localFetch(`${localBase(url)}/audio/voices`, { method: 'GET', headers: localHeaders(key) });
  if (res.status === 404 || res.status === 405) {
    // no voice list — prove the server is there at all
    const models = await localFetch(`${localBase(url)}/models`, { method: 'GET', headers: localHeaders(key) });
    if (!models.ok) throw new Error(await readError(models));
    return null;
  }
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json().catch(() => null);
  const raw: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.voices) ? j.voices : Array.isArray(j?.data) ? j.data : [];
  const out: VoiceDef[] = [];
  let aliases = false;
  for (const v of raw) {
    if (typeof v === 'string') { out.push({ id: v, label: v }); continue; }
    const o = v as { voice_id?: string; id?: string; name?: string; type?: string };
    const id = o.voice_id ?? o.id ?? o.name;
    if (!id) continue;
    if (o.type === 'openai_alias') { aliases = true; continue; }
    out.push({ id: String(id), label: o.name ? String(o.name) : String(id) });
  }
  if (aliases) out.unshift({ id: 'default', label: 'Default voice' });
  return out.length ? out : null;
}

/** Cut text into pieces of at most `max` characters, at sentence ends where possible, else at spaces. */
export function chunkText(text: string, max: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf('; '));
    if (cut < max * 0.4) cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf(' '));
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Decode several audio blobs and join them into one WAV. */
async function joinAudio(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  const ctx = audioContext();
  const buffers: AudioBuffer[] = [];
  for (const b of blobs) buffers.push(await ctx.decodeAudioData(await b.arrayBuffer()));
  const rate = buffers[0].sampleRate;
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const pcm = new Int16Array(total);
  let at = 0;
  for (const b of buffers) {
    const ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) pcm[at + i] = Math.max(-32768, Math.min(32767, Math.round(ch[i] * 32767)));
    at += ch.length;
  }
  return pcmToWav(new Uint8Array(pcm.buffer), rate);
}

/** Speak `text`; resolves with a decodable audio blob. Long text is spoken in pieces and joined. */
export async function synthesizeSpeech(provider: SpeechProvider, key: string, text: string, voice: string): Promise<Blob> {
  const pieces = chunkText(text, MAX_INPUT[provider]);
  if (pieces.length === 0) throw new Error('There is nothing to say.');
  if (pieces.length > 1) {
    const parts: Blob[] = [];
    for (const piece of pieces) parts.push(await synthesizeSpeech(provider, key, piece, voice));
    return joinAudio(parts);
  }
  if (provider === 'kokoro') {
    const speak = window.drawflow?.voiceSpeak;
    if (!speak) throw new Error('The built-in voice is part of the DrawFlow desktop app.');
    const r = await speak(text, voice);
    if ('error' in r) throw new Error(r.error);
    return new Blob([r.wav as BlobPart], { type: 'audio/wav' });
  }
  if (provider === 'local') {
    const local = getAiSettings().localVoice;
    const res = await localFetch(`${localBase(local.url)}/audio/speech`, {
      method: 'POST',
      headers: localHeaders(key),
      // "tts-1" means "the active engine" to VoiceStudio and other OpenAI-compatible servers
      body: JSON.stringify({ model: local.model.trim() || 'tts-1', input: text, voice, response_format: 'wav' }),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.blob();
  }
  if (provider === 'openai' || provider === 'groq') {
    const res = await fetch(`${provider === 'openai' ? OPENAI : GROQ}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODELS[provider].model, input: text, voice, response_format: 'wav' }),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.blob();
  }
  // Gemini returns base64 PCM (24 kHz, mono, 16-bit)
  const res = await fetch(`${GEMINI}/models/${encodeURIComponent(TTS_MODELS[provider].model.replace(/^models\//, ''))}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data);
  if (!part) throw new Error('Gemini returned no audio.');
  const mime: string = part.inlineData.mimeType ?? 'audio/L16;rate=24000';
  const rate = parseInt(/rate=(\d+)/.exec(mime)?.[1] ?? '24000', 10);
  const bin = atob(part.inlineData.data);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  return pcmToWav(pcm, rate);
}

// --- transcription (word timestamps drive "sync to narration") -------------

export interface TranscriptWord { word: string; start: number; end: number }
export interface Transcript { text: string; words: TranscriptWord[]; segments: { text: string; start: number; end: number }[] }

export const STT_MODELS: Record<'openai' | 'groq', string> = {
  openai: 'whisper-1',
  groq: 'whisper-large-v3-turbo',
};

/** Transcribe an audio blob with word-level timestamps (OpenAI or Groq Whisper). */
export async function transcribe(provider: 'openai' | 'groq', key: string, blob: Blob, filename = 'audio.wav'): Promise<Transcript> {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', STT_MODELS[provider]);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  const res = await fetch(`${provider === 'openai' ? OPENAI : GROQ}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  return {
    text: j.text ?? '',
    words: (j.words ?? []).map((w: { word: string; start: number; end: number }) => ({ word: w.word, start: w.start, end: w.end })),
    segments: (j.segments ?? []).map((s: { text: string; start: number; end: number }) => ({ text: s.text.trim(), start: s.start, end: s.end })),
  };
}
