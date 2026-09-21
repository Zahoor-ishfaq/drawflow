// Models are asked for JSON but sometimes hand back something slightly off:
// a code fence, prose around it, trailing commas, an unescaped quote inside a
// string (typically SVG attributes or a quoted word in the narration), or a
// reply cut short by the token limit. This repairs the usual damage before
// giving up.

export class ModelJsonError extends Error {
  constructor(detail: string) {
    super(`The model's answer was not valid JSON (${detail}).`);
    this.name = 'ModelJsonError';
  }
}

/** The JSON-looking part of a reply: inside a code fence if there is one, from the first { or [ onwards. */
export function jsonSlice(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const starts = [body.indexOf('{'), body.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) return body;
  const start = Math.min(...starts);
  const endObj = body.lastIndexOf('}'), endArr = body.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

/** Escape double quotes that sit inside strings without ending them. */
function escapeStrayQuotes(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) {
      out += c;
      if (c === '"') inStr = true;
      continue;
    }
    if (c === '\\') { out += c + (s[i + 1] ?? ''); i++; continue; }
    if (c === '"') {
      // a real closing quote is followed (after spaces) by , } ] : or the end
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j];
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') { out += c; inStr = false; }
      else out += '\\"';
      continue;
    }
    if (c === '\n') { out += '\\n'; continue; } // raw newlines inside strings
    out += c;
  }
  return out;
}

/** Close whatever is still open at the end of a reply that was cut short. */
function closeOpen(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let fixed = s;
  if (inStr) fixed += '"';
  // drop a dangling ", " or ": " left by the cut
  fixed = fixed.replace(/[,:]\s*$/, '');
  while (stack.length) fixed += stack.pop();
  return fixed;
}

const stripTrailingCommas = (s: string) => s.replace(/,\s*([}\]])/g, '$1');

/** Just the first complete top-level value — drops stray brackets the model appended after it. */
function firstValue(s: string): string {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return s.slice(0, i + 1); }
  }
  return s;
}

/** Parse a model's JSON reply, repairing the usual mistakes; throws ModelJsonError when it can't. */
export function parseModelJson(text: string): unknown {
  const raw = jsonSlice(text);
  const attempts: (() => string)[] = [
    () => raw,
    () => firstValue(raw),
    () => stripTrailingCommas(firstValue(raw)),
    () => stripTrailingCommas(firstValue(escapeStrayQuotes(raw))),
    () => stripTrailingCommas(closeOpen(raw)),
    () => stripTrailingCommas(closeOpen(escapeStrayQuotes(raw))),
  ];
  let lastError = '';
  for (const make of attempts) {
    try { return JSON.parse(make()); } catch (e) { lastError = e instanceof Error ? e.message : String(e); }
  }
  throw new ModelJsonError(lastError.replace(/^JSON\.parse: /, '').slice(0, 120));
}
