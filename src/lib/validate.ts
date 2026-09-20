// Tolerant validation of a project document: fills defaults, drops what
// cannot be used, and reports what it changed. The formal JSON Schema lives
// in schema/drawflow.schema.json; this keeps the app running on files that
// are slightly off rather than refusing them.

import type { AudioClip, DrawElement, Project } from '../types';
import { DEFAULT_PROJECT } from '../store/useStore';

export interface DocumentInput {
  project: Partial<Project> | undefined;
  elements: unknown[];
  audioClips: unknown[];
}

export interface ValidatedDocument {
  doc: { project: Project; elements: DrawElement[]; audioClips: AudioClip[] };
  problems: string[];
}

const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

const STYLES = new Set(['draw', 'appear', 'fade', 'slide', 'wipe', 'scale', 'pop', 'bounce', 'typewriter']);
const KINDS = new Set(['text', 'shape', 'svg', 'image']);
const CAMERAS = new Set(['auto', 'whole', 'previous', 'custom', 'scene']);
const DIRECTIONS = new Set(['left', 'right', 'top', 'bottom']);
const LANES = new Set(['music', 'voice', 'sfx']);
const PAPERS = new Set(['plain', 'grid', 'dots', 'lined', 'cream', 'chalkboard', 'kraft']);

export function validateDocument(input: DocumentInput): ValidatedDocument {
  const problems: string[] = [];
  const p = (input.project ?? {}) as Record<string, unknown>;

  const project: Project = {
    ...DEFAULT_PROJECT,
    ...(input.project as Partial<Project>),
    name: str(p.name, DEFAULT_PROJECT.name),
    width: num(p.width, 1920, 64, 8192),
    height: num(p.height, 1080, 64, 8192),
    fps: [24, 25, 30, 50, 60].includes(p.fps as number) ? (p.fps as number) : 30,
    background: str(p.background, '#ffffff'),
    paper: PAPERS.has(p.paper as string) ? (p.paper as Project['paper']) : 'plain',
    duration: num(p.duration, 5, 0),
    hand: str(p.hand, 'marker'),
    cameraEasing: ['easeOut', 'linear', 'cut'].includes(p.cameraEasing as string) ? (p.cameraEasing as Project['cameraEasing']) : 'easeOut',
    cameraFill: num(p.cameraFill, 0.5, 0.1, 1),
    zoomAtEnd: bool(p.zoomAtEnd, false),
    endHold: num(p.endHold, 1.5, 0, 60),
    scenes: Array.isArray(p.scenes) ? (p.scenes as Project['scenes']) : [],
    markers: Array.isArray(p.markers) ? (p.markers as Project['markers']) : [],
  };
  if (p.fps !== undefined && project.fps !== p.fps) problems.push(`Frame rate ${String(p.fps)} is not supported; using 30.`);

  const elements: DrawElement[] = [];
  const ids = new Set<string>();
  (input.elements ?? []).forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    if (!e || typeof e !== 'object') { problems.push(`Element ${i + 1} is not an object; dropped.`); return; }
    if (!Array.isArray(e.paths) || !e.paths.every((d) => typeof d === 'string')) { problems.push(`Element ${i + 1} (${str(e.label, 'unnamed')}) has no path data; dropped.`); return; }
    const kind = KINDS.has(e.kind as string) ? (e.kind as DrawElement['kind']) : 'svg';
    if (kind === 'image' && !(e.image && typeof (e.image as { src?: unknown }).src === 'string')) { problems.push(`Image "${str(e.label, 'unnamed')}" has no picture data; dropped.`); return; }
    let id = str(e.id, '');
    if (!id || ids.has(id)) { id = crypto.randomUUID(); if (e.id) problems.push(`Duplicate element id fixed for "${str(e.label, 'unnamed')}".`); }
    ids.add(id);
    const el: DrawElement = {
      ...(e as unknown as DrawElement),
      id,
      kind,
      label: str(e.label, kind),
      paths: e.paths as string[],
      fillColor: str(e.fillColor, 'none'),
      strokeColor: str(e.strokeColor, '#1a1a1a'),
      strokeWidth: num(e.strokeWidth, 4, 0, 200),
      fillAfterDraw: bool(e.fillAfterDraw, false),
      x: num(e.x, project.width / 2),
      y: num(e.y, project.height / 2),
      scale: num(e.scale, 1, 0.001, 1000),
      rotation: num(e.rotation, 0),
      startTime: num(e.startTime, 0, 0),
      drawDuration: num(e.drawDuration, 2, 0.05, 600),
      pauseAfter: num(e.pauseAfter, 0.5, 0, 600),
      transitionIn: num(e.transitionIn, 0.6, 0, 60),
      style: STYLES.has(e.style as string) ? (e.style as DrawElement['style']) : 'draw',
      slideFrom: DIRECTIONS.has(e.slideFrom as string) ? (e.slideFrom as DrawElement['slideFrom']) : 'left',
      zIndex: num(e.zIndex, i),
      camera: CAMERAS.has(e.camera as string) ? (e.camera as DrawElement['camera']) : 'auto',
      cameraZoom: num(e.cameraZoom, 1, 0.25, 3),
    };
    if (el.style === 'typewriter' && kind !== 'text') el.style = 'draw';
    elements.push(el);
  });

  const audioClips: AudioClip[] = [];
  (input.audioClips ?? []).forEach((raw, i) => {
    const c = raw as Record<string, unknown>;
    if (!c || typeof c !== 'object' || typeof c.sourceId !== 'string') { problems.push(`Audio clip ${i + 1} has no source; dropped.`); return; }
    audioClips.push({
      ...(c as unknown as AudioClip),
      id: str(c.id, crypto.randomUUID()),
      name: str(c.name, 'Audio'),
      lane: LANES.has(c.lane as string) ? (c.lane as AudioClip['lane']) : 'music',
      startTime: num(c.startTime, 0, 0),
      offset: num(c.offset, 0, 0),
      duration: num(c.duration, 1, 0.05),
      volume: num(c.volume, 1, 0, 1.5),
      fadeIn: num(c.fadeIn, 0, 0),
      fadeOut: num(c.fadeOut, 0, 0),
      muted: bool(c.muted, false),
    });
  });

  // scenes referenced by elements must exist
  const sceneIds = new Set((project.scenes ?? []).map((s) => s.id));
  for (const el of elements) {
    if (el.sceneId && !sceneIds.has(el.sceneId)) { problems.push(`"${el.label}" pointed at a missing scene; cleared.`); el.sceneId = undefined; }
  }

  return { doc: { project, elements, audioClips }, problems };
}
