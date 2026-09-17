// Thin clients for the four providers. Everything is a plain fetch from the
// browser with the user's own key (Anthropic needs its browser-access header).

import type { ImageProvider, TextProvider } from './settings';

export interface ModelInfo { id: string; label: string }

export interface ChatInput {
  system: string;
  user: string;
  /** optional picture for vision-capable models */
  image?: { mime: string; base64: string };
}

const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI = 'https://api.openai.com/v1';
const GROQ = 'https://api.groq.com/openai/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

async function readError(res: Response): Promise<string> {
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  try {
    const j = JSON.parse(body);
    const m = j.error?.message ?? j.message ?? j.error;
    if (typeof m === 'string') return `${res.status}: ${m}`;
  } catch { /* not json */ }
  return `${res.status}: ${body.slice(0, 200) || res.statusText}`;
}

function bearer(key: string) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// --- models -----------------------------------------------------------------

export async function listModels(provider: TextProvider, key: string): Promise<ModelInfo[]> {
  if (!key) throw new Error('Enter an API key first.');
  switch (provider) {
    case 'anthropic': {
      const res = await fetch(`${ANTHROPIC}/models?limit=100`, {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      return (j.data as { id: string; display_name?: string }[]).map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
    }
    case 'openai':
    case 'groq': {
      const res = await fetch(`${provider === 'openai' ? OPENAI : GROQ}/models`, { headers: bearer(key) });
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      const ids = (j.data as { id: string }[]).map((m) => m.id);
      const chatty = ids.filter((id) =>
        provider === 'openai'
          ? /^(gpt-|o\d)/.test(id) && !/(realtime|audio|tts|transcribe|embedding|image|dall-e|moderation|search|instruct|codex)/.test(id)
          : !/(whisper|tts|guard|embedding|distil)/i.test(id),
      );
      return chatty.sort().map((id) => ({ id, label: id }));
    }
    case 'gemini': {
      const res = await fetch(`${GEMINI}/models?pageSize=100&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      return (j.models as { name: string; displayName?: string; supportedGenerationMethods?: string[] }[])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && !/embedding|aqa|tts|audio/i.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }));
    }
  }
}

/** Gemini image-capable models (from the same list). */
export function isGeminiImageModel(id: string): boolean {
  return /image/i.test(id);
}

// --- chat -----------------------------------------------------------------

export async function chat(provider: TextProvider, key: string, model: string, input: ChatInput): Promise<string> {
  if (!key) throw new Error('No API key for this provider — add one in AI settings.');
  if (!model) throw new Error('Pick a model in AI settings.');
  switch (provider) {
    case 'anthropic': {
      const content: unknown[] = [];
      if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mime, data: input.image.base64 } });
      content.push({ type: 'text', text: input.user });
      const res = await fetch(`${ANTHROPIC}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': key, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true', 'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 4096, system: input.system, messages: [{ role: 'user', content }] }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      return (j.content as { type: string; text?: string }[]).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    }
    case 'openai':
    case 'groq': {
      const userContent: unknown[] = [{ type: 'text', text: input.user }];
      if (input.image) userContent.push({ type: 'image_url', image_url: { url: `data:${input.image.mime};base64,${input.image.base64}` } });
      const res = await fetch(`${provider === 'openai' ? OPENAI : GROQ}/chat/completions`, {
        method: 'POST',
        headers: bearer(key),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.image ? userContent : input.user },
          ],
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? '';
    }
    case 'gemini': {
      const parts: unknown[] = [{ text: input.user }];
      if (input.image) parts.push({ inlineData: { mimeType: input.image.mime, data: input.image.base64 } });
      const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts }],
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const j = await res.json();
      const p = j.candidates?.[0]?.content?.parts ?? [];
      return (p as { text?: string }[]).map((x) => x.text ?? '').join('\n');
    }
  }
}

// --- images ---------------------------------------------------------------

export interface GeneratedImage { mime: string; base64: string }

/** Generate a picture from a prompt, optionally transforming an input picture. */
export async function generateImage(
  provider: ImageProvider, key: string, model: string, prompt: string,
  input?: { mime: string; base64: string },
): Promise<GeneratedImage> {
  if (!key) throw new Error('No API key for the image provider — add one in AI settings.');
  if (!model) throw new Error('Pick an image model in AI settings.');
  if (provider === 'gemini') {
    const parts: unknown[] = [{ text: prompt }];
    if (input) parts.push({ inlineData: { mimeType: input.mime, data: input.base64 } });
    const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const j = await res.json();
    const out = (j.candidates?.[0]?.content?.parts ?? []) as { inlineData?: { mimeType: string; data: string } }[];
    const img = out.find((p) => p.inlineData)?.inlineData;
    if (!img) throw new Error('The model returned no image (try a different image model).');
    return { mime: img.mimeType, base64: img.data };
  }
  // OpenAI
  if (input) {
    const bytes = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('image', new Blob([bytes], { type: input.mime }), 'input.png');
    form.append('size', '1024x1024');
    const res = await fetch(`${OPENAI}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(await readError(res));
    const j = await res.json();
    return { mime: 'image/png', base64: j.data[0].b64_json };
  }
  const res = await fetch(`${OPENAI}/images/generations`, {
    method: 'POST',
    headers: bearer(key),
    body: JSON.stringify({ model, prompt, size: '1024x1024', n: 1, ...(model.startsWith('gpt-image') ? { quality: 'medium' } : { response_format: 'b64_json' }) }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  return { mime: 'image/png', base64: j.data[0].b64_json };
}
