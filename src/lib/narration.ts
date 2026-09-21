// "Fit to narration": line elements up with the phrases of the voiceover.
// Phrase boundaries come either from silence detection (offline) or from a
// transcript's sentence timestamps (AI). Element k is given the k-th phrase:
// it starts drawing when the phrase starts and its pause runs to the next.

import type { AudioClip, DrawElement } from '../types';
import { getSource } from '../store/audioSources';
import { speechSegments, type SpeechSegment } from './audioTools';
import { emphasisSpan } from './timing';

/** Phrases across every voice clip, in timeline seconds. */
export function narrationPhrases(clips: AudioClip[], minPause = 0.35): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const c of clips.filter((c) => c.lane === 'voice' && !c.muted)) {
    const src = getSource(c.sourceId);
    if (!src) continue;
    for (const s of speechSegments(src.buffer, c.offset, c.offset + c.duration, minPause)) {
      out.push({ start: c.startTime + (s.start - c.offset), end: c.startTime + (s.end - c.offset) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Merge or split phrases so there is one per element. */
export function matchPhrases(phrases: SpeechSegment[], count: number): SpeechSegment[] {
  if (count === 0 || phrases.length === 0) return [];
  if (phrases.length === count) return phrases;
  if (phrases.length > count) {
    // group consecutive phrases into `count` buckets of similar total length
    const total = phrases[phrases.length - 1].end - phrases[0].start;
    const per = total / count;
    const out: SpeechSegment[] = [];
    let cur = { ...phrases[0] };
    for (let i = 1; i < phrases.length; i++) {
      if (cur.end - cur.start >= per * 0.85 && out.length < count - 1) { out.push(cur); cur = { ...phrases[i] }; }
      else cur.end = phrases[i].end;
    }
    out.push(cur);
    return out;
  }
  // fewer phrases than elements: split the longest phrases evenly
  const out = phrases.map((p) => ({ ...p }));
  while (out.length < count) {
    let li = 0;
    for (let i = 1; i < out.length; i++) if (out[i].end - out[i].start > out[li].end - out[li].start) li = i;
    const p = out[li];
    const mid = (p.start + p.end) / 2;
    out.splice(li, 1, { start: p.start, end: mid }, { start: mid, end: p.end });
  }
  return out;
}

/**
 * Timing patches so element k draws during phrase k and holds until
 * phrase k+1 begins. Elements keep their transitions; the first element's
 * lead-in becomes a pause on nothing (the camera just waits).
 */
export function fitToPhrases(ordered: DrawElement[], phrases: SpeechSegment[]): Map<string, Partial<DrawElement>> {
  const patches = new Map<string, Partial<DrawElement>>();
  const visible = ordered.filter((e) => !e.hidden && !e.withPrevious);
  const matched = matchPhrases(phrases, visible.length);
  if (matched.length === 0) return patches;
  let prevEnd = 0; // when the previous slot ends
  visible.forEach((el, i) => {
    const ph = matched[i];
    const nextStart = matched[i + 1]?.start ?? ph.end + 0.6;
    // the transition into this element fills the gap after the previous slot
    const transition = i === 0 ? 0 : Math.max(0.2, Math.min(5, ph.start - prevEnd));
    const start = i === 0 ? 0 : prevEnd + transition;
    // draw at the element's own pace but never past the end of its phrase, so
    // the picture is complete while the narrator is still on it (the first
    // element cannot wait for its phrase: the chain starts at 0)
    const room = Math.max(0.4, ph.end - start);
    const draw = Math.max(0.4, Math.min(el.drawDuration || room, room));
    const slotEnd = Math.max(start + draw + emphasisSpan(el), nextStart - 0.15);
    const pause = Math.max(0, slotEnd - (start + draw + emphasisSpan(el)));
    patches.set(el.id, { transitionIn: transition, drawDuration: +draw.toFixed(2), pauseAfter: +pause.toFixed(2) });
    prevEnd = slotEnd;
  });
  return patches;
}
