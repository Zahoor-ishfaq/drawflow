// Bring-your-own-key AI settings. Keys live only in this browser's local
// storage and are sent straight to the chosen provider, nowhere else.

import { useSyncExternalStore } from 'react';

export type TextProvider = 'anthropic' | 'openai' | 'groq' | 'gemini';
export type ImageProvider = 'gemini' | 'openai';

/** Whether a key is on the provider's free tier (limits which models work) or a paid plan. */
export type Plan = 'free' | 'paid';

/**
 * A text-to-speech app running on this computer (VoiceStudio, qwentts.cpp…)
 * that speaks the OpenAI /audio/speech protocol — offline, no per-character cost.
 */
export interface LocalVoiceSettings {
  enabled: boolean;
  /** base address up to and including /v1 */
  url: string;
  /** most local apps need none */
  key: string;
  /** '' = the app's active engine */
  model: string;
  /** voices the app listed when asked (its own and cloned ones) */
  voices: { id: string; label: string }[];
  /** voice names typed by hand, comma-separated (for apps that don't list them) */
  extraVoices: string;
}

export interface AiSettings {
  keys: Record<TextProvider, string>;
  textProvider: TextProvider;
  textModel: Record<TextProvider, string>;
  imageProvider: ImageProvider;
  imageModel: Record<ImageProvider, string>;
  plan: Record<TextProvider, Plan>;
  localVoice: LocalVoiceSettings;
  /** which offline voice the Voice panel uses: the built-in one or a voice app on this computer */
  offlineEngine: 'builtin' | 'app';
}

const KEY = 'drawflow.ai';

const DEFAULTS: AiSettings = {
  keys: { anthropic: '', openai: '', groq: '', gemini: '' },
  textProvider: 'groq',
  textModel: { anthropic: '', openai: '', groq: '', gemini: '' },
  imageProvider: 'gemini',
  imageModel: { gemini: '', openai: 'gpt-image-1' },
  // Groq and Gemini keys start on a free tier; Anthropic and OpenAI are paid
  plan: { anthropic: 'paid', openai: 'paid', groq: 'free', gemini: 'free' },
  localVoice: { enabled: false, url: 'http://127.0.0.1:3900/v1', key: '', model: '', voices: [], extraVoices: '' },
  offlineEngine: 'builtin',
};

function load(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      keys: { ...DEFAULTS.keys, ...(parsed.keys ?? {}) },
      textModel: { ...DEFAULTS.textModel, ...(parsed.textModel ?? {}) },
      imageModel: { ...DEFAULTS.imageModel, ...(parsed.imageModel ?? {}) },
      plan: { ...DEFAULTS.plan, ...(parsed.plan ?? {}) },
      localVoice: { ...DEFAULTS.localVoice, ...(parsed.localVoice ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

let current: AiSettings = load();
const listeners = new Set<() => void>();

export function getAiSettings(): AiSettings {
  return current;
}

export function updateAiSettings(patch: Partial<AiSettings>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage full/blocked */ }
  listeners.forEach((l) => l());
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
  );
}

export const PROVIDER_LABELS: Record<TextProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  groq: 'Groq (Llama, GPT-OSS)',
  gemini: 'Google Gemini',
};

/** Providers that offer a free tier, where the plan switch matters. */
export const HAS_FREE_TIER: Record<TextProvider, boolean> = { anthropic: false, openai: false, groq: true, gemini: true };

export const KEY_HELP: Record<TextProvider, string> = {
  anthropic: 'console.anthropic.com → API keys',
  openai: 'platform.openai.com → API keys',
  groq: 'console.groq.com → API keys',
  gemini: 'aistudio.google.com → Get API key',
};

/** true when the active text provider has a key and a model */
export function textReady(s: AiSettings = current): boolean {
  return !!s.keys[s.textProvider] && !!s.textModel[s.textProvider];
}

export function imageReady(s: AiSettings = current): boolean {
  return !!s.keys[s.imageProvider] && !!s.imageModel[s.imageProvider];
}
