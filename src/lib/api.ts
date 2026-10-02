// The scripting surface exposed as window.DrawFlow: used by the CLI
// renderer, the test-suite, benchmarks and plugins. Everything here is a
// thin wrapper over the store and the export pipeline.

import { useStore } from '../store/useStore';
import { useUiStore } from '../store/uiStore';
import { exportVideo, type ExportFormat, type ExportOptions, type ExportResult } from './exportVideo';
import { exportProjectFile, importProjectFile, parseProjectFile, saveNow } from './persistence';
import { clearSources, decodeToSource } from '../store/audioSources';
import { validateDocument } from './validate';
import { exportBench } from './exportBench';
import { pluginApi, activateInstalledPlugins, getPlugins } from './plugins';
import { addTextElement, addImportedSvg, addImageElement } from './addElements';
import { TEMPLATES, buildTemplate } from '../assets/templates';
import { slotEnd } from './timing';
import { addScene, addVoiceover, describeProject, sceneRange } from './automation';
import { KOKORO_VOICES } from './ai/speech';
import type { DrawElement, Project } from '../types';

export const VERSION = '0.2.0';

export interface RenderOptions {
  format?: ExportFormat;
  height?: number;
  /** scene name or id to render on its own */
  scene?: string;
  onProgress?: (phase: string, fraction: number) => void;
  signal?: AbortSignal;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return btoa(s);
}

export const api = {
  version: VERSION,
  store: useStore,
  ui: useUiStore,
  plugins: pluginApi,
  /** what plugins have registered (read-only) */
  get registry() { return getPlugins(); },
  templates: TEMPLATES,

  /** Replace the open project with a .drawflow.json string (does not touch the project list). */
  async loadProject(json: string): Promise<{ problems: string[] }> {
    const parsed = await parseProjectFile(json);
    clearSources();
    for (const src of parsed.sources) {
      try { await decodeToSource(src.blob, src.name, src.id); } catch { /* skip */ }
    }
    useStore.getState().loadDocument(validateDocument({ project: parsed.project, elements: parsed.elements, audioClips: parsed.audioClips }).doc);
    return { problems: parsed.problems };
  },
  /** Open a File as a new project (same as the menu). */
  importFile: importProjectFile,
  /** The open project as a .drawflow.json string. */
  async saveProject(): Promise<string> {
    const { blob } = await exportProjectFile();
    return blob.text();
  },
  checkpoint: saveNow,

  async newFromTemplate(id: string): Promise<void> {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`No template "${id}". Known: ${TEMPLATES.map((x) => x.id).join(', ')}`);
    const built = await buildTemplate(t);
    useStore.getState().loadDocument({ ...built, audioClips: [] });
  },

  // --- building --------------------------------------------------------------
  addText: addTextElement,
  addSvg: addImportedSvg,
  addImage: addImageElement,
  get project(): Project { return useStore.getState().project; },
  get elements(): DrawElement[] { return [...useStore.getState().elements].sort((a, b) => a.zIndex - b.zIndex); },

  // --- rendering --------------------------------------------------------------
  /** Render the open project; resolves with the file and its metadata. */
  async render(opts: RenderOptions = {}): Promise<ExportResult & { blob: Blob }> {
    const s = useStore.getState();
    let range: ExportOptions['range'];
    if (opts.scene) {
      const sc = (s.project.scenes ?? []).find((x) => x.id === opts.scene || x.name.toLowerCase() === opts.scene!.toLowerCase());
      if (!sc) throw new Error(`No scene "${opts.scene}".`);
      const members = api.elements.filter((e) => e.sceneId === sc.id && !e.hidden);
      if (!members.length) throw new Error(`Scene "${sc.name}" has no elements.`);
      range = { start: Math.max(0, members[0].startTime - members[0].transitionIn), end: Math.min(s.project.duration, Math.max(...members.map(slotEnd)) + 0.5) };
    }
    s.pause();
    s.setExporting(true);
    try {
      const result = await exportVideo({
        format: opts.format ?? 'mp4',
        height: opts.height ?? s.project.exportHeight ?? 1080,
        project: s.project,
        elements: s.elements,
        audioClips: s.audioClips,
        time: s.currentTime,
        range,
        signal: opts.signal,
        onPhase: (phase) => { s.setExportProgress(0); opts.onProgress?.(phase, 0); },
        onProgress: (p) => { s.setExportProgress(p); opts.onProgress?.('capturing', p); },
      });
      const blob = await (await fetch(result.url)).blob();
      return { ...result, blob };
    } finally {
      s.setExporting(false);
    }
  },
  /** Like render(), but returns base64 (for automation that cannot read Blobs). */
  async renderBase64(opts: RenderOptions = {}): Promise<{ base64: string; filename: string; sizeBytes: number; elapsedMs: number; engine: string }> {
    const r = await api.render(opts);
    return { base64: await blobToBase64(r.blob), filename: r.filename, sizeBytes: r.sizeBytes, elapsedMs: r.elapsedMs, engine: r.engine };
  },
  bench: exportBench,

  // --- automation (the MCP server, scripts) -----------------------------------
  /** Start an empty project with these settings (the open one is replaced). */
  newProject(settings: Partial<Pick<Project, 'name' | 'width' | 'height' | 'fps' | 'exportHeight' | 'paper' | 'hand'>> = {}): void {
    const s = useStore.getState();
    s.newProject();
    s.updateProject(settings);
  },
  /** Add a scene of text / SVG / image / library items — see automation.ts. */
  addScene,
  /** Narrate a scene from an audio file or text (built-in voice) — see automation.ts. */
  addVoiceover,
  /** The open project as a plain summary (scenes, timing, items, voiceovers). */
  describe: describeProject,
  /** The built-in offline voice's speakers (text voiceovers need the desktop app or the MCP server). */
  voices: KOKORO_VOICES,
  /** One frame as a PNG (base64): a scene's finished drawing, or the frame at `time`. */
  async previewBase64(opts: { scene?: string; time?: number; height?: number } = {}): Promise<{ base64: string; time: number }> {
    const s = useStore.getState();
    let t = opts.time ?? s.project.duration - 0.05;
    if (opts.time === undefined && opts.scene) {
      const sc = (s.project.scenes ?? []).find((x) => x.id === opts.scene || x.name.toLowerCase() === opts.scene!.toLowerCase())
        ?? (/^\d+$/.test(opts.scene) ? (s.project.scenes ?? [])[parseInt(opts.scene, 10) - 1] : undefined);
      if (!sc) throw new Error(`No scene "${opts.scene}".`);
      const range = sceneRange(sc.id);
      if (!range) throw new Error(`Scene "${sc.name}" has no elements.`);
      // just after its last item is drawn — the end of the scene can already be inside the next one's fade
      const drawn = Math.max(...api.elements.filter((e) => e.sceneId === sc.id && !e.hidden).map((e) => e.startTime + e.drawDuration));
      t = Math.min(drawn + 0.5, range.end - 0.05); // text fills in just after its strokes
    }
    s.pause();
    s.setTime(Math.max(0, t));
    const r = await api.renderBase64({ format: 'png', height: opts.height ?? 540 });
    return { base64: r.base64, time: +useStore.getState().currentTime.toFixed(2) };
  },
};

export type DrawFlowApi = typeof api;

/** Install the global and start plugins. */
export function installApi(): void {
  (window as unknown as { DrawFlow: DrawFlowApi }).DrawFlow = api;
  void activateInstalledPlugins(api);
}
