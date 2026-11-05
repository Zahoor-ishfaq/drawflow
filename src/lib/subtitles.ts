// Subtitles: words timed to the voice. A voice clip keeps its text and cues
// (in seconds into its audio), so subtitles follow the clip when it moves,
// is trimmed or is split; an imported .srt is kept on the project instead,
// in timeline seconds and replaces the voice's own. subtitleSprite.ts paints them.

import type { AudioClip, Project, SubtitleCue, SubtitleSettings } from '../types';

export const SUBTITLE_DEFAULTS: SubtitleSettings = {
  show: false, font: 'Arial', size: 44, position: 'bottom', color: '#ffffff', box: true,
};

/** Two rows of about 42 Latin letters, or 21 Chinese, Japanese or Korean characters. */
const CUE_WIDTH = 84;

export function subtitleSettings(project: Pick<Project, 'subtitles'>): SubtitleSettings {
  return { ...SUBTITLE_DEFAULTS, ...project.subtitles };
}

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** Width in Latin letters: wide scripts take two. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

/** Where to cut a line that is too long: after a comma if there is one, else a space, else anywhere. */
function breakPoint(s: string, limit: number): number {
  const chars = Array.from(s);
  let width = 0, end = 0;
  for (; end < chars.length; end++) {
    width += textWidth(chars[end]);
    if (width > limit) break;
  }
  const head = chars.slice(0, end).join('');
  const clause = Math.max(...[...',，、'].map((m) => head.lastIndexOf(m)));
  if (clause >= head.length / 3) return clause + 1;
  const space = head.lastIndexOf(' ');
  return space > 0 ? space + 1 : head.length;
}

const ENDS_SENTENCE = /[.!?。！？]["'”’)）]*$/;
const glue = (a: string, b: string) => (WIDE.test(a.slice(-1)) ? `${a}${b}` : `${a} ${b}`);

/** Split narration into subtitle-sized chunks, at sentence and clause breaks. */
export function chunkText(text: string, limit = CUE_WIDTH): string[] {
  const out: string[] = [];
  for (let part of text.trim().split(/(?<=[.!?:;])\s+|(?<=[。！？；：])\s*|\n+/)) {
    part = part.trim();
    while (textWidth(part) > limit) {
      const cut = breakPoint(part, limit);
      out.push(part.slice(0, cut).trim());
      part = part.slice(cut).trim();
    }
    if (part) out.push(part);
  }
  const merged: string[] = []; // short neighbours share a cue when they fit
  for (const p of out) {
    const last = merged[merged.length - 1];
    if (last && !ENDS_SENTENCE.test(last) && textWidth(last) + 1 + textWidth(p) <= limit) merged[merged.length - 1] = glue(last, p);
    else merged.push(p);
  }
  return merged;
}

interface Span { start: number; end: number }
/** Punctuation, as a point in the text measured in width. */
interface Mark { at: number; strong: boolean }
/** A point in the text known to line up with a point in the speech. */
interface Anchor { at: number; clock: number }

/** How well a stretch of text must fit its stretch of speech: seconds of slack, and slack per second. */
const SLACK = 0.25, SLACK_RATE = 0.2;
/** Cost of a sentence end or a comma with no pause, and of a pause of 0.3 s with no punctuation. */
const SKIP_STOP = 1.2, SKIP_COMMA = 0.15, QUIET = 0.3;
/** How far back an alignment step looks, so a very long clip stays quick. */
const REACH = 160;

/**
 * Narrators pause at punctuation, and pauses can be measured, so punctuation
 * can be pinned to the audio. Each mark may claim a pause; a claim costs
 * whatever it does to the speaking pace on either side, leaving a mark or a
 * long pause unclaimed costs too, and the cheapest path through the whole clip
 * wins. Pinning to a pause stops timing errors adding up along the clip.
 */
function alignToPauses(marks: Mark[], total: number, said: Span[]): Anchor[] {
  const clock: number[] = []; // seconds of speech before each pause
  let spoken = 0;
  for (const s of said) clock.push((spoken += s.end - s.start));
  const pauses = said.length - 1;
  const pace = spoken / total; // seconds of speech per unit of text
  const skipMark = [0], skipPause = [0];
  for (const m of marks) skipMark.push(skipMark[skipMark.length - 1] + (m.strong ? SKIP_STOP : SKIP_COMMA));
  for (let j = 0; j < pauses; j++) skipPause.push(skipPause[j] + ((said[j + 1].start - said[j].end) / QUIET) ** 2);

  interface Node { mark: number; pause: number; cost: number; from: Node | null }
  const nodes: Node[] = [{ mark: -1, pause: -1, cost: 0, from: null }];
  const reach = (mark: number, pause: number): Node | null => {
    const at = mark < marks.length ? marks[mark].at : total;
    const heard = pause < pauses ? clock[pause] : spoken;
    let best: Node | null = null;
    for (let k = nodes.length - 1; k >= Math.max(0, nodes.length - REACH); k--) {
      const n = nodes[k];
      if (n.mark >= mark || n.pause >= pause) continue;
      const want = (at - (n.mark < 0 ? 0 : marks[n.mark].at)) * pace;
      const got = heard - (n.pause < 0 ? 0 : clock[n.pause]);
      const off = (got - want) / (SLACK + SLACK_RATE * want);
      const cost = n.cost + off * off + skipMark[mark] - skipMark[n.mark + 1] + skipPause[pause] - skipPause[n.pause + 1];
      if (!best || cost < best.cost) best = { mark, pause, cost, from: n };
    }
    return best;
  };

  const band = Math.min(30, Math.max(3, spoken * 0.15));
  marks.forEach((m, i) => {
    for (let j = 0; j < pauses; j++) {
      if (Math.abs(clock[j] - m.at * pace) > band) continue;
      const node = reach(i, j);
      if (node) nodes.push(node);
    }
  });
  const anchors: Anchor[] = [];
  for (let n = reach(marks.length, pauses)?.from ?? null; n && n.from; n = n.from) anchors.unshift({ at: marks[n.mark].at, clock: clock[n.pause] });
  return anchors;
}

/**
 * Time the text to the speech. Between pinned points the words are spread
 * over the time the narrator is actually speaking, so a pause holds the words
 * instead of dragging them out of step.
 */
export function cuesFromSpeech(text: string, speech: Span[], limit = CUE_WIDTH): SubtitleCue[] {
  const chunks = chunkText(text, limit);
  const said = speech.filter((s) => s.end > s.start);
  if (!chunks.length || !said.length) return [];

  const starts: number[] = [];
  const marks: Mark[] = [];
  let total = 0;
  for (const chunk of chunks) {
    starts.push(total);
    const chars = Array.from(chunk);
    chars.forEach((ch, i) => {
      total += textWidth(ch);
      if (/[.,;:!?。，、；：！？]/.test(ch) && (i === chars.length - 1 || /[\s"'”’)）]/.test(chars[i + 1]) || WIDE.test(ch))) {
        marks.push({ at: total, strong: /[.!?。！？]/.test(ch) });
      }
    });
    total += 1;
  }
  const inside = marks.filter((m) => m.at < total - 2);
  const spoken = said.reduce((n, s) => n + s.end - s.start, 0);
  const points: Anchor[] = [{ at: 0, clock: 0 }, ...alignToPauses(inside, total, said), { at: total, clock: spoken }];

  /** Seconds of speech by this point in the text. */
  const heardBy = (at: number): number => {
    let k = 0;
    while (k < points.length - 2 && points[k + 1].at <= at) k++;
    const a = points[k], b = points[k + 1];
    return a.clock + ((at - a.at) / (b.at - a.at)) * (b.clock - a.clock);
  };
  /** The time in the audio after this much speech. Exactly at a pause: its end for a start, its beginning for an end. */
  const timeOf = (heard: number, starting: boolean): number => {
    let left = heard;
    for (const s of said) {
      const d = s.end - s.start;
      if (starting ? left < d : left <= d + 1e-9) return s.start + Math.min(left, d);
      left -= d;
    }
    return said[said.length - 1].end;
  };

  const cues = chunks.map((chunk, i) => ({
    start: timeOf(heardBy(starts[i]), true),
    end: timeOf(i + 1 < chunks.length ? heardBy(starts[i + 1] - 1) : spoken, false),
    text: chunk,
  }));
  // give the eye a moment after the last word, without touching the next line
  return cues.map((c, i) => ({
    start: +c.start.toFixed(3),
    end: +Math.min(c.end + 0.3, cues[i + 1]?.start ?? Infinity).toFixed(3),
    text: c.text,
  }));
}

/** Every subtitle in the project, in timeline seconds. An imported .srt wins, so a corrected file can replace the voice's own. */
export function subtitleCues(project: Pick<Project, 'subtitles'>, clips: AudioClip[]): SubtitleCue[] {
  const imported = project.subtitles?.cues;
  if (imported?.length) return [...imported].sort((a, b) => a.start - b.start);
  const out: SubtitleCue[] = [];
  for (const c of clips) {
    if (c.lane !== 'voice' || c.muted || !c.cues) continue;
    for (const q of c.cues) {
      const start = Math.max(c.startTime, c.startTime + q.start - c.offset);
      const end = Math.min(c.startTime + c.duration, c.startTime + q.end - c.offset);
      if (end - start > 0.05) out.push({ start, end, text: q.text });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Subtitles for a part of the video: only what shows in it, timed from its start. */
export function cuesInRange(cues: SubtitleCue[], from: number, to: number): SubtitleCue[] {
  return cues
    .filter((c) => c.end > from && c.start < to)
    .map((c) => ({ start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from, text: c.text }));
}

export function cueAt(cues: SubtitleCue[], t: number): SubtitleCue | null {
  let hit: SubtitleCue | null = null;
  for (const c of cues) {
    if (c.start > t) break;
    if (t < c.end) hit = c;
  }
  return hit;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: SubtitleCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
function readTime(s: string): number | null {
  const m = TIME.exec(s);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4].padEnd(3, '0')) / 1000);
}

/** The text of a subtitle file. Older Chinese ones are often GBK rather than UTF-8. */
export function decodeSrt(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('gb18030').decode(b);
  }
}

/** Download subtitles as an .srt file. */
export function saveSrt(name: string, cues: SubtitleCue[]): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toSrt(cues)], { type: 'application/x-subrip' }));
  a.download = `${name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'subtitles'}.srt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Read an .srt (or .vtt) file. Formatting tags are dropped; broken blocks are skipped. */
export function parseSrt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const row = lines.findIndex((l) => l.includes('-->'));
    if (row < 0) continue;
    const [from, to] = lines[row].split('-->');
    const start = readTime(from), end = readTime(to);
    const words = lines.slice(row + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (start === null || end === null || end <= start || !words) continue;
    cues.push({ start, end, text: words });
  }
  return cues;
}
