import type { TextProvider } from './settings';

/**
 * Turns whatever an AI provider threw at us (raw HTTP bodies, quota dumps,
 * our own messages) into something a person can act on.
 */

export type ProblemKind = 'key' | 'quota' | 'credit' | 'model' | 'network' | 'busy' | 'content' | 'request' | 'other';

/** What the failed call was for — each job has its own provider setting. */
export type AiRole = 'text' | 'image' | 'voice' | 'transcribe';

export interface Problem {
  kind: ProblemKind;
  title: string;
  message: string;
  /** what to do about it, in order */
  steps: string[];
  /** the raw text, for the "details" disclosure */
  details?: string;
  /** which setting this call actually used (so people don't change the wrong one) */
  note?: string;
  /** offer the AI settings button */
  settings?: boolean;
  /** an external page that helps (billing, keys, status) */
  link?: { label: string; url: string };
  provider?: TextProvider;
}

const NAMES: Record<TextProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', groq: 'Groq', gemini: 'Google Gemini' };

const LINKS: Record<TextProvider, { keys: string; billing: string; status: string }> = {
  anthropic: { keys: 'https://console.anthropic.com/settings/keys', billing: 'https://console.anthropic.com/settings/billing', status: 'https://status.anthropic.com' },
  openai: { keys: 'https://platform.openai.com/api-keys', billing: 'https://platform.openai.com/settings/organization/billing', status: 'https://status.openai.com' },
  groq: { keys: 'https://console.groq.com/keys', billing: 'https://console.groq.com/settings/billing', status: 'https://groqstatus.com' },
  gemini: { keys: 'https://aistudio.google.com/app/apikey', billing: 'https://ai.google.dev/gemini-api/docs/rate-limits', status: 'https://status.cloud.google.com' },
};

function guessProvider(text: string): TextProvider | undefined {
  const t = text.toLowerCase();
  if (t.includes('googleapis') || t.includes('gemini') || t.includes('generativelanguage')) return 'gemini';
  if (t.includes('anthropic') || t.includes('claude')) return 'anthropic';
  if (t.includes('groq')) return 'groq';
  if (t.includes('openai') || t.includes('gpt-')) return 'openai';
  return undefined;
}

/** "429: …" prefixes come from our fetch wrappers. */
function statusOf(text: string): number | undefined {
  const m = /^(\d{3}):/.exec(text.trim());
  return m ? Number(m[1]) : undefined;
}

/** Model ids mentioned in the body, e.g. "model: gemini-2.5-flash-preview-image". */
function modelOf(text: string): string | undefined {
  const m = /model[:\s]+['"`]?([\w.\-:/]+)/i.exec(text);
  return m?.[1];
}

function roleNote(role: AiRole | undefined, name: string): string | undefined {
  switch (role) {
    case 'image': return `This request went to your picture provider (${name}), chosen under “Pictures” in AI settings. The text provider — used for scripts and suggestions — is not involved, so changing it won't help here.`;
    case 'voice': return `This request went to ${name}, the provider picked in the voice card — not the text provider.`;
    case 'transcribe': return `Transcription uses Groq or OpenAI Whisper (${name} here), whichever key you have — not the text provider.`;
    case 'text': return `This request went to your text provider (${name}), the one with the radio button in AI settings.`;
    default: return undefined;
  }
}

export function explainAiError(err: unknown, provider?: TextProvider, role?: AiRole): Problem {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const p = provider ?? guessProvider(raw);
  const name = p ? NAMES[p] : 'the AI provider';
  const links = p ? LINKS[p] : undefined;
  const status = statusOf(raw);
  const low = raw.toLowerCase();
  const model = modelOf(raw);
  const details = raw.replace(/\s+/g, ' ').slice(0, 900);
  const base = { details, provider: p, note: p ? roleNote(role, name) : undefined };
  const modelStep = role === 'image'
    ? `Pick a different image model (the “Images” field under ${name} in AI settings), or switch Pictures to the other provider.`
    : 'Pick a different model in AI settings — the free ones work straight away.';

  // couldn't even reach the server
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed|err_(name|internet|connection)/i.test(raw)) {
    return {
      ...base, kind: 'network', title: `Couldn't reach ${name}`,
      message: 'The request never got an answer, so this is about the connection rather than your key or plan.',
      steps: ['Check that you are online and try again.', 'A firewall, VPN or ad blocker can block API calls — allow the provider\'s domain or turn it off for this page.', 'If it keeps happening, the provider may be down.'],
      link: links ? { label: `${name} status`, url: links.status } : undefined,
    };
  }

  if (/was not valid json/i.test(raw)) {
    return {
      ...base, kind: 'other', title: 'The model sent a broken answer',
      message: 'It replied with text that is not valid JSON even after a repair attempt. This is random — the same request usually works on the next try — but some models do it more than others.',
      steps: ['Press Generate again.', 'Use a stronger model in AI settings: Gemini 2.5 Flash, Llama 3.3 70B or GPT-OSS 120B are reliable; small or "instant" models are not.', 'Ask for fewer scenes or a shorter script.'],
      settings: true,
    };
  }

  if (status === undefined && !/quota|rate limit|overloaded|safety|blocked|content_filter|api key not valid|invalid.?api.?key/i.test(low)) {
    // one of our own messages ("Enter an API key first.", "The model did not return a plan.")
    const needsKey = /api key|pick a model|ai settings/i.test(raw);
    return {
      ...base, kind: needsKey ? 'key' : 'other', title: needsKey ? 'AI is not set up yet' : 'That didn\'t work',
      message: raw, steps: needsKey ? ['Open AI settings, choose a provider and paste a key — keys stay in this browser.'] : ['Try again, or rephrase the request.'],
      settings: needsKey, details: undefined, note: undefined,
    };
  }

  if (status === 401 || status === 403 || /api key not valid|invalid.?api.?key|incorrect api key|authentication|unauthori[sz]ed|permission denied/i.test(low)) {
    return {
      ...base, kind: 'key', title: `${name} rejected your API key`,
      message: 'The key was sent but the provider does not accept it, so nothing was generated.',
      steps: [`Open AI settings and check the ${name} key for typos or missing characters.`, 'Make sure the key belongs to this provider — each provider needs its own key.', 'A key made a moment ago can take a minute to become active; a revoked key never will.'],
      settings: true, link: links ? { label: `Manage ${name} keys`, url: links.keys } : undefined,
    };
  }

  // OpenAI says "exceeded your current quota" when prepaid credit is gone; Gemini says the same words for every 429
  const geminiQuota = p === 'gemini' && /quota exceeded for metric|resource_exhausted/.test(low);
  if (status === 402 || /insufficient_quota|credit balance|billing hard limit|purchase credits|no credits/i.test(low) || (!geminiQuota && /exceeded your current quota/.test(low))) {
    return {
      ...base, kind: 'credit', title: `Your ${name} account has run out of credit`,
      message: 'The key works, but the account behind it has no balance left, so the provider declined the request.',
      steps: [`Add credit or a payment method on the ${name} billing page.`, 'Or switch to another provider in AI settings (Groq and Gemini have free tiers).'],
      settings: true, link: links ? { label: `${name} billing`, url: links.billing } : undefined,
    };
  }

  if (status === 429 || /rate limit|quota exceeded|too many requests|resource_exhausted/i.test(low)) {
    const noAllowance = /limit:\s*0\b/.test(low) || /not available (on|in) (the )?free tier|free tier/.test(low);
    if (noAllowance) {
      return {
        ...base, kind: 'quota', title: `${model ?? 'This model'} isn't included in your ${name} plan`,
        message: `The provider reports a quota of zero for this model — your account has no allowance for it (it is usually a paid-only or preview model).`,
        steps: [modelStep, `Or enable billing on your ${name} account to unlock it.`],
        settings: true, link: links ? { label: `${name} plans & limits`, url: links.billing } : undefined,
      };
    }
    return {
      ...base, kind: 'quota', title: `${name} is asking you to slow down`,
      message: 'You have hit the request or token limit for this key. Nothing is wrong with the project — the provider just needs a pause.',
      steps: ['Wait a minute and try again (free tiers reset per minute and per day).', 'Ask for less at once, e.g. a shorter script or fewer scenes.', 'Or switch provider or model in AI settings.'],
      settings: true, link: links ? { label: `${name} rate limits`, url: links.billing } : undefined,
    };
  }

  if (status === 404 || /model.*(not found|does not exist|not supported|is not available|deprecated)|no such model|unknown model/i.test(low)) {
    return {
      ...base, kind: 'model', title: `${name} doesn't know the model ${model ? `“${model}”` : 'you chose'}`,
      message: 'The model id is not available to this key — it may have been renamed, retired, or not enabled for your account.',
      steps: [
        role === 'image' ? modelStep : 'Open AI settings and press Models: the working model is picked and checked for you.',
        p === 'gemini' || p === 'groq' ? 'On a free key only the free-tier models answer — keep Plan on "Free" so only those are offered, or switch it to "Paid" if you have billing.' : 'If you typed the id by hand, check the spelling.',
      ],
      settings: true,
    };
  }

  if (/safety|blocked|content_filter|content policy|refus|harm_category|prohibited/i.test(low)) {
    return {
      ...base, kind: 'content', title: 'The model declined this request',
      message: 'Its safety filter stopped the response before anything came back.',
      steps: ['Rephrase the prompt — avoid names of real people, violence and medical or legal claims.', 'For photos, try a different picture or the offline doodle style.'],
    };
  }

  if (status === 413 || /too large|too long|maximum context|context length|exceeds the .*limit/i.test(low)) {
    return {
      ...base, kind: 'request', title: 'The request is too big for this model',
      message: 'The text or picture is over what the model accepts in one go.',
      steps: ['Shorten the script or split it into parts.', 'Use a smaller photo (under about 4 MB).', 'Or pick a model with a larger limit in AI settings.'],
      settings: true,
    };
  }

  if ((status !== undefined && status >= 500) || /overloaded|server error|bad gateway|service unavailable|try again later|internal error/i.test(low)) {
    return {
      ...base, kind: 'busy', title: `${name} is having trouble right now`,
      message: 'The provider\'s servers answered with an error of their own. It is not caused by your project or key.',
      steps: ['Wait a moment and try again.', 'If it keeps failing, check the provider\'s status page or switch provider in AI settings.'],
      settings: true, link: links ? { label: `${name} status`, url: links.status } : undefined,
    };
  }

  if (status === 400 || status === 422) {
    return {
      ...base, kind: 'request', title: `${name} rejected the request`,
      message: 'The provider could not process what was sent. This is usually a model that does not support this kind of request.',
      steps: ['Try a different model in AI settings.', 'Try again with a shorter or simpler prompt.', 'The details below say exactly what the provider objected to.'],
      settings: true,
    };
  }

  return {
    ...base, kind: 'other', title: `${name} returned an error`,
    message: 'The request failed for a reason we could not classify. The details below are the provider\'s own words.',
    steps: ['Try again in a moment.', 'If it persists, try another model or provider in AI settings.'],
    settings: true,
  };
}
