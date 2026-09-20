import type { AudioClip, AudioLaneKind } from '../types';

/**
 * Clips on one lane never overlap, like tracks in a video editor: a clip you
 * drag stops at its neighbour's edge, trims can't eat into the next clip and
 * new clips land in the nearest free gap.
 */

const EPS = 1e-6;

const others = (clips: AudioClip[], lane: AudioLaneKind, excludeId?: string) =>
  clips.filter((c) => c.lane === lane && c.id !== excludeId);

const overlaps = (start: number, duration: number, c: AudioClip) =>
  c.startTime < start + duration - EPS && c.startTime + c.duration > start + EPS;

/**
 * Where a clip of `duration` may sit when the user asks for `start`, given it
 * currently sits at `from`: it is pushed back out of any clip it would cover,
 * in the direction it came from, until it rests in free space.
 */
export function resolveClipStart(clips: AudioClip[], clip: Pick<AudioClip, 'id' | 'lane'>, start: number, duration: number, from: number): number {
  const rest = others(clips, clip.lane, clip.id);
  const movingRight = start >= from;
  let s = Math.max(0, start);
  for (let guard = 0; guard <= rest.length; guard++) {
    const hit = rest.filter((c) => overlaps(s, duration, c));
    if (hit.length === 0) return s;
    s = movingRight
      ? Math.min(...hit.map((c) => c.startTime)) - duration
      : Math.max(...hit.map((c) => c.startTime + c.duration));
    if (s < 0) break;
  }
  // nothing fits in that direction — stay put
  return from;
}

/** Earliest the start edge may be trimmed to: the end of the clip before it. */
export function trimStartLimit(clips: AudioClip[], clip: AudioClip): number {
  const before = others(clips, clip.lane, clip.id).filter((c) => c.startTime < clip.startTime + clip.duration - EPS && c.startTime + c.duration <= clip.startTime + EPS);
  return before.length ? Math.max(...before.map((c) => c.startTime + c.duration)) : 0;
}

/** Latest the end edge may be trimmed to: the start of the clip after it. */
export function trimEndLimit(clips: AudioClip[], clip: AudioClip): number {
  const after = others(clips, clip.lane, clip.id).filter((c) => c.startTime >= clip.startTime + clip.duration - EPS);
  return after.length ? Math.min(...after.map((c) => c.startTime)) : Infinity;
}

/** First start at or after `at` where a clip of `duration` fits on the lane. */
export function freeStart(clips: AudioClip[], lane: AudioLaneKind, at: number, duration: number): number {
  const rest = others(clips, lane).sort((a, b) => a.startTime - b.startTime);
  let s = Math.max(0, at);
  for (const c of rest) {
    if (c.startTime + c.duration <= s + EPS) continue; // entirely before
    if (c.startTime >= s + duration - EPS) break; // fits before this one
    s = c.startTime + c.duration; // slide past it
  }
  return s;
}

/** Apply a start/duration patch to a clip without letting it cover a neighbour. */
export function constrainClipPatch(clips: AudioClip[], clip: AudioClip, patch: Partial<AudioClip>): Partial<AudioClip> {
  const next = { ...clip, ...patch };
  if (next.lane !== clip.lane) {
    // moving lanes: land in the nearest free gap of the new lane
    return { ...patch, startTime: freeStart(clips, next.lane, next.startTime, next.duration) };
  }
  const startChanged = patch.startTime !== undefined && Math.abs(patch.startTime - clip.startTime) > EPS;
  const durChanged = patch.duration !== undefined && Math.abs(patch.duration - clip.duration) > EPS;
  if (!startChanged && !durChanged) return patch;
  if (startChanged && durChanged) {
    // start-edge trim: the start can't go left of the previous clip
    const limit = trimStartLimit(clips, clip);
    if (next.startTime < limit) {
      const delta = limit - next.startTime;
      return { ...patch, startTime: limit, duration: next.duration - delta, offset: (patch.offset ?? clip.offset) + delta };
    }
    return patch;
  }
  if (durChanged) {
    const limit = trimEndLimit(clips, clip);
    return next.startTime + next.duration > limit ? { ...patch, duration: Math.max(0.2, limit - next.startTime) } : patch;
  }
  return { ...patch, startTime: resolveClipStart(clips, clip, next.startTime, next.duration, clip.startTime) };
}

/**
 * Make room for something recorded over [start, end) on a lane: clips fully
 * inside go, clips crossing an edge are trimmed, a clip that spans the whole
 * range is split around it (what a video editor's record-overwrite does).
 */
export function overwriteRange(clips: AudioClip[], lane: AudioLaneKind, start: number, end: number): AudioClip[] {
  return clips.flatMap((c) => {
    if (c.lane !== lane) return [c];
    const cEnd = c.startTime + c.duration;
    if (cEnd <= start + EPS || c.startTime >= end - EPS) return [c];
    const out: AudioClip[] = [];
    if (c.startTime < start - 0.05) out.push({ ...c, duration: start - c.startTime, fadeOut: Math.min(c.fadeOut, start - c.startTime) });
    if (cEnd > end + 0.05) {
      const cut = end - c.startTime;
      out.push({ ...c, id: out.length ? crypto.randomUUID() : c.id, startTime: end, offset: c.offset + cut, duration: c.duration - cut, fadeIn: Math.min(c.fadeIn, c.duration - cut) });
    }
    return out;
  });
}
