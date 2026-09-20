// Plugin registry. A plugin is a plain ES module (loaded from a URL or from
// pasted code) whose default export is `{ id, name, setup(api) }`. `setup`
// receives the DrawFlow API and registers what it provides:
//
//   api.plugins.registerEffect({ kind: 'entrance'|'emphasis'|'exit', id, label, frame })
//   api.plugins.registerAssetProvider({ id, label, search })
//   api.plugins.registerExporter({ id, label, run })
//   api.plugins.registerPanel({ id, label, mount })
//
// Effects take part in rendering (preview and export alike), asset providers
// appear in the Images panel, exporters as buttons after an export, panels
// as tabs in the library rail. Everything is in-memory except the list of
// installed plugin sources, which lives in localStorage.

import { useSyncExternalStore } from 'react';
import type { DrawElement } from '../types';
import type { ElementFrame, Rect } from './renderFrame';
import type { ExportResult } from './exportVideo';

export interface EffectPlugin {
  kind: 'entrance' | 'emphasis' | 'exit';
  id: string;
  label: string;
  /**
   * Compute the element's frame. `p` is 0..1 progress through the effect,
   * `base` is the frame before this effect is applied (for emphasis/exit),
   * `view` the camera frame. Return a partial to merge into the frame.
   */
  frame: (args: { el: DrawElement; p: number; t: number; base: ElementFrame; view: Rect; bounds: Rect }) => Partial<ElementFrame>;
}

export interface AssetProviderPlugin {
  id: string;
  label: string;
  /** results: SVG text or a data: URL / http URL for pictures */
  search: (query: string) => Promise<{ id: string; name: string; svg?: string; imageUrl?: string; width?: number; height?: number }[]>;
}

export interface ExporterPlugin {
  id: string;
  label: string;
  run: (result: ExportResult, blob: Blob) => Promise<void> | void;
}

export interface PanelPlugin {
  id: string;
  label: string;
  /** render into `host`; return a cleanup function */
  mount: (host: HTMLElement) => (() => void) | void;
}

export interface PluginModule {
  id: string;
  name: string;
  description?: string;
  setup: (api: unknown) => void | Promise<void>;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  /** where it came from: a URL, or inline code */
  source: { url: string } | { code: string };
  enabled: boolean;
  error?: string;
}

const KEY = 'drawflow.plugins';

interface Registry {
  effects: EffectPlugin[];
  assetProviders: AssetProviderPlugin[];
  exporters: ExporterPlugin[];
  panels: PanelPlugin[];
  installed: InstalledPlugin[];
}

let registry: Registry = { effects: [], assetProviders: [], exporters: [], panels: [], installed: loadInstalled() };
const listeners = new Set<() => void>();
function notify() { registry = { ...registry }; listeners.forEach((l) => l()); }

function loadInstalled(): InstalledPlugin[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InstalledPlugin[]) : [];
  } catch {
    return [];
  }
}
function saveInstalled(): void {
  try { localStorage.setItem(KEY, JSON.stringify(registry.installed)); } catch { /* quota */ }
}

export function usePlugins(): Registry {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => registry);
}
export function getPlugins(): Registry { return registry; }

export const pluginApi = {
  registerEffect(e: EffectPlugin) { registry.effects = [...registry.effects.filter((x) => x.id !== e.id || x.kind !== e.kind), e]; notify(); },
  registerAssetProvider(p: AssetProviderPlugin) { registry.assetProviders = [...registry.assetProviders.filter((x) => x.id !== p.id), p]; notify(); },
  registerExporter(x: ExporterPlugin) { registry.exporters = [...registry.exporters.filter((y) => y.id !== x.id), x]; notify(); },
  registerPanel(p: PanelPlugin) { registry.panels = [...registry.panels.filter((x) => x.id !== p.id), p]; notify(); },
};

/** Effect lookup used by the renderer: ids are stored as `plugin:<id>`. */
export const PLUGIN_EFFECT_PREFIX = 'plugin:';
export function pluginEffect(kind: EffectPlugin['kind'], id: string | undefined | null): EffectPlugin | undefined {
  if (!id || !id.startsWith(PLUGIN_EFFECT_PREFIX)) return undefined;
  const bare = id.slice(PLUGIN_EFFECT_PREFIX.length);
  return registry.effects.find((e) => e.kind === kind && e.id === bare);
}

async function loadModule(source: InstalledPlugin['source']): Promise<PluginModule> {
  const url = 'url' in source ? source.url : URL.createObjectURL(new Blob([source.code], { type: 'text/javascript' }));
  try {
    const mod = (await import(/* @vite-ignore */ url)) as { default?: PluginModule } & Partial<PluginModule>;
    const plugin = mod.default ?? (mod as PluginModule);
    if (!plugin || typeof plugin.setup !== 'function' || !plugin.id) throw new Error('A plugin module must default-export { id, name, setup(api) }.');
    return plugin;
  } finally {
    if ('code' in source) URL.revokeObjectURL(url);
  }
}

/** Load (or reload) one installed plugin. */
export async function activatePlugin(p: InstalledPlugin, api: unknown): Promise<void> {
  try {
    const mod = await loadModule(p.source);
    await mod.setup(api);
    p.name = mod.name || p.name;
    p.error = undefined;
  } catch (e) {
    p.error = e instanceof Error ? e.message : String(e);
  }
  saveInstalled();
  notify();
}

export async function installPlugin(source: InstalledPlugin['source'], api: unknown): Promise<InstalledPlugin> {
  const mod = await loadModule(source); // throws on a broken module before anything is stored
  const existing = registry.installed.find((p) => p.id === mod.id);
  const entry: InstalledPlugin = existing ?? { id: mod.id, name: mod.name, source, enabled: true };
  entry.source = source;
  entry.name = mod.name;
  entry.enabled = true;
  if (!existing) registry.installed = [...registry.installed, entry];
  await mod.setup(api);
  entry.error = undefined;
  saveInstalled();
  notify();
  return entry;
}

export function removePlugin(id: string): void {
  registry.installed = registry.installed.filter((p) => p.id !== id);
  // registrations made by the plugin are cleared on the next reload; drop what we can now
  saveInstalled();
  notify();
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  registry.installed = registry.installed.map((p) => (p.id === id ? { ...p, enabled } : p));
  saveInstalled();
  notify();
}

/** Called once at startup with the API object. */
export async function activateInstalledPlugins(api: unknown): Promise<void> {
  for (const p of registry.installed) {
    if (p.enabled) await activatePlugin(p, api);
  }
}
