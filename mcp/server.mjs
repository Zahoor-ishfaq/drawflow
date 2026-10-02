#!/usr/bin/env node
// DrawFlow MCP server (stdio): lets an AI assistant build whiteboard videos
// end to end — create a project, add scenes of text / SVG / pictures, narrate
// them, preview frames and render the video — without the editor.
//
// It keeps one headless DrawFlow open (cli/app-session.mjs, the same session
// the CLI renders with) and does everything through window.DrawFlow, so
// projects are ordinary .drawflow.json files built by the editor's own code.
// Text voiceovers use the built-in offline voice (electron/voice-core.cjs),
// handed to the page the way the desktop app hands it over.
//
// Environment:
//   DRAWFLOW_PROJECTS   folder for projects (default: ~/Documents/DrawFlow)
//   DRAWFLOW_MODELS     folder for the voice model (default: the desktop app's)
//   DRAWFLOW_BROWSER    Chromium/Chrome/Edge executable (default: Chrome, Edge, Chromium)

// stdout carries the protocol: anything a library prints goes to stderr instead
console.log = console.info = console.debug = (...a) => console.error(...a);

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, writeFile, readdir, rename, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { ROOT, startApp } from '../cli/app-session.mjs';

const require = createRequire(import.meta.url);
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;

const PROJECTS = path.resolve(process.env.DRAWFLOW_PROJECTS || path.join(os.homedir(), 'Documents', 'DrawFlow'));
/** Same folder as the desktop app's userData/models, so the voice model is downloaded once for both. */
const MODELS = process.env.DRAWFLOW_MODELS || path.join(
  process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')),
  'drawflow', 'models');

const log = (...a) => console.error('[drawflow-mcp]', ...a);

// --- the headless app ---------------------------------------------------------

let voice = null;
/** The built-in voice, loaded on first use (the model downloads once, ~92 MB). */
function builtInVoice() {
  if (!voice) {
    const { createVoice } = require('../electron/voice-core.cjs');
    voice = createVoice({ modelsDir: MODELS, onProgress: (loaded, total) => log(`downloading the voice model… ${Math.floor((100 * loaded) / total)}%`) });
  }
  return voice;
}

let app = null;
async function session() {
  if (app) return app;
  log('starting DrawFlow (headless)…');
  app = await startApp({
    executable: process.env.DRAWFLOW_BROWSER || undefined,
    onPageError: (e) => log('page error:', String(e).slice(0, 300)),
    prepare: async (context) => {
      // the page's built-in voice calls window.drawflow.voiceSpeak — as in the desktop app
      await context.exposeFunction('__drawflowSpeak', async (text, voiceId, speed) => Buffer.from(await builtInVoice().speak(text, voiceId, speed ?? 1)).toString('base64'));
      await context.addInitScript(() => {
        window.drawflow = {
          voiceSpeak: async (text, voiceId, speed) => {
            try {
              const b64 = await window.__drawflowSpeak(text, voiceId, speed);
              return { wav: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) };
            } catch (e) {
              return { error: String(e?.message ?? e) };
            }
          },
          voiceStatus: async () => ({ downloaded: true }),
        };
      });
    },
  }).catch((e) => { app = null; throw e; });
  app.page.on('close', () => { app = null; });
  return app;
}

// one tool call at a time: they share one open document
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

// --- projects -------------------------------------------------------------------

const slug = (s) => String(s).trim().toLowerCase().replace(/\.drawflow\.json$|\.json$/i, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled';

async function projectFiles() {
  await mkdir(PROJECTS, { recursive: true });
  return (await readdir(PROJECTS)).filter((f) => f.endsWith('.drawflow.json')).map((f) => path.join(PROJECTS, f));
}

/** A project by file path, file name or title. */
async function resolveProject(ref) {
  if (!ref || !String(ref).trim()) throw new Error('Name the project (its title, file name or path).');
  const candidates = [path.resolve(ref), path.join(PROJECTS, ref), path.join(PROJECTS, `${slug(ref)}.drawflow.json`)];
  for (const c of candidates) if (c.endsWith('.json') && existsSync(c)) return c;
  const known = (await projectFiles()).map((f) => path.basename(f, '.drawflow.json'));
  throw new Error(`No project "${ref}" in ${PROJECTS}.${known.length ? ` Projects: ${known.join(', ')}.` : ' Create one with create_project.'}`);
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/** Open the project in the app, run `fn(page)`, and save it back if `save`. */
async function withProject(ref, fn, { save = true } = {}) {
  const file = await resolveProject(ref);
  const { page } = await session();
  const load = await page.evaluate((j) => window.DrawFlow.loadProject(j), await readFile(file, 'utf8'));
  const result = await fn(page, file, load.problems);
  if (save) await writeAtomic(file, await page.evaluate(() => window.DrawFlow.saveProject()));
  return result;
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm',
};

async function readMedia(file, kind) {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime || !mime.startsWith(kind)) throw new Error(`${path.basename(abs)} is not a supported ${kind} file (${Object.keys(MIME).filter((k) => MIME[k].startsWith(kind)).join(', ')}).`);
  return { base64: (await readFile(abs)).toString('base64'), mime, name: path.basename(abs, path.extname(abs)) };
}

/** "1080p", "720p", "4k", "1920x1080", "1080x1920", "vertical", "square" → canvas + output height. */
function parseResolution(res = '1080p') {
  const r = String(res).trim().toLowerCase();
  const named = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2k': [2560, 1440], '4k': [3840, 2160], '2160p': [3840, 2160], 'vertical': [1080, 1920], '9:16': [1080, 1920], 'square': [1080, 1080], '1:1': [1080, 1080], '16:9': [1920, 1080] };
  let w; let h;
  if (named[r]) [w, h] = named[r];
  else {
    const m = /^(\d{3,5})\s*[x×]\s*(\d{3,5})$/.exec(r);
    if (!m) throw new Error(`Resolution "${res}" not understood — use 720p, 1080p, 1440p, 4k, vertical, square or WIDTHxHEIGHT.`);
    [w, h] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  }
  // the canvas keeps the editor's 1920-wide layout scale; the output size is the render height
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const canvas = w >= h ? { width: 1920, height: even((1920 * h) / w) } : { width: even((1920 * w) / h), height: 1920 };
  return { ...canvas, exportHeight: even(h), label: `${w}x${h}` };
}

const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] });
/** The message alone: errors thrown inside the app arrive as "page.evaluate: Error: …" plus a stack. */
const failure = (e) => ({
  isError: true,
  content: [{ type: 'text', text: String(e?.message ?? e).replace(/^page\.evaluate: /, '').replace(/^Error: /, '').split(/\n\s+at /)[0].trim() }],
});
/** Wrap a handler: serialized, and errors returned as tool errors rather than protocol errors. */
const tool = (fn) => (args, extra) => serial(() => fn(args, extra)).catch(failure);

// --- server ---------------------------------------------------------------------

const server = new McpServer({ name: 'drawflow', version: VERSION });

server.registerTool('create_project', {
  title: 'Create a DrawFlow project',
  description: `Create an empty whiteboard-animation project (a .drawflow.json file in ${PROJECTS}). Then add scenes with add_scene, narrate them with add_voiceover, check them with get_preview and make the video with render.`,
  inputSchema: {
    title: z.string().min(1).describe('Project title; also its file name.'),
    resolution: z.string().default('1080p').describe('Output size: 720p, 1080p, 1440p, 4k, vertical (1080x1920), square, or WIDTHxHEIGHT.'),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30).describe('Frame rate.'),
    paper: z.enum(['plain', 'grid', 'dots', 'lined', 'cream', 'chalkboard', 'kraft']).optional().describe('Board style (default plain white).'),
    overwrite: z.boolean().default(false).describe('Replace an existing project with the same name.'),
  },
}, tool(async ({ title, resolution, fps, paper, overwrite }) => {
  const res = parseResolution(resolution);
  await mkdir(PROJECTS, { recursive: true });
  const file = path.join(PROJECTS, `${slug(title)}.drawflow.json`);
  if (existsSync(file) && !overwrite) throw new Error(`A project "${slug(title)}" already exists (${file}). Pick another title or pass overwrite: true.`);
  const { page } = await session();
  await page.evaluate((s) => window.DrawFlow.newProject(s), { name: title, width: res.width, height: res.height, fps, exportHeight: res.exportHeight, ...(paper ? { paper } : {}) });
  await writeAtomic(file, await page.evaluate(() => window.DrawFlow.saveProject()));
  return text({ project: slug(title), file, title, resolution: res.label, fps, next: 'add_scene' });
}));

const item = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).describe('Words to hand-write; \\n for line breaks. Keep it short (a title or key phrase).'), size: z.enum(['title', 'normal', 'small']).optional() }),
  z.object({ type: z.literal('svg'), svg: z.string().optional().describe('SVG markup. Line art (stroke, no fill) draws best.'), path: z.string().optional().describe('…or a path to an .svg file.'), label: z.string().optional() }),
  z.object({ type: z.literal('image'), path: z.string().describe('Path to a PNG, JPEG, WebP or GIF; it is revealed with a scribble.'), label: z.string().optional() }),
  z.object({ type: z.literal('library'), query: z.string().min(1).describe('Search the built-in library of 5,000+ drawings, e.g. "light bulb", "person thinking", "rocket".'), color: z.boolean().optional().describe('Coloured version where available.') }),
]);

server.registerTool('add_scene', {
  title: 'Add a scene',
  description: 'Append a scene to a project. Each scene gets its own part of the board (the camera moves to it and the board is cleared) and its items are hand-drawn one after another, laid out left to right. Content can be text, SVG, an image file or a picture from the built-in library — one item or a list.',
  inputSchema: {
    project: z.string().describe('Project title, file name or path.'),
    content: z.union([item, z.array(item).min(1).max(6)]).describe('What the scene shows.'),
    name: z.string().optional().describe('Scene name (default "Scene N").'),
    draw_duration: z.number().positive().max(60).optional().describe('Seconds each item takes to draw (default: its own pace).'),
    hold_duration: z.number().min(0).max(60).optional().describe('Seconds the finished scene stays on screen.'),
    transition: z.enum(['cut', 'fade', 'wipe']).optional().describe('How the scene starts (default fade, cut for the first).'),
  },
}, tool(async ({ project, content, name, draw_duration, hold_duration, transition }) => {
  const items = [];
  for (const it of Array.isArray(content) ? content : [content]) {
    if (it.type === 'svg') {
      const svg = it.svg ?? (it.path ? await readFile(path.resolve(it.path), 'utf8') : null);
      if (!svg) throw new Error('An svg item needs "svg" markup or a "path" to an .svg file.');
      items.push({ type: 'svg', svg, label: it.label ?? (it.path ? path.basename(it.path, '.svg') : undefined) });
    } else if (it.type === 'image') {
      const media = await readMedia(it.path, 'image');
      items.push({ type: 'image', base64: media.base64, mime: media.mime, name: it.label ?? media.name });
    } else items.push(it);
  }
  return withProject(project, async (page) => {
    const r = await page.evaluate((o) => window.DrawFlow.addScene(o), { name, items, drawDuration: draw_duration, holdDuration: hold_duration, transition });
    const total = await page.evaluate(() => window.DrawFlow.project.duration);
    return text({ scene: r.name, id: r.id, items: r.elements, starts: +r.start.toFixed(2), ends: +r.end.toFixed(2), projectDuration: +total.toFixed(2) });
  });
}));

server.registerTool('add_voiceover', {
  title: 'Add a voiceover to a scene',
  description: 'Narrate a scene from an audio file, or from text spoken by the built-in offline voice (free, no key; the first use downloads its model, about 92 MB). Replaces the scene\'s previous voiceover. By default the drawing is retimed so each item is drawn while its phrase is spoken; later scenes move along.',
  inputSchema: {
    project: z.string().describe('Project title, file name or path.'),
    scene: z.string().describe('Scene name, id or number (1 = first).'),
    text: z.string().optional().describe('Narration to speak with the built-in voice.'),
    audio_path: z.string().optional().describe('…or a path to an audio file (WAV, MP3, M4A, OGG, FLAC, WebM).'),
    voice: z.string().optional().describe('Built-in voice for text (see list_voices; default af_heart).'),
    fit_drawing: z.boolean().default(true).describe('Retime the scene\'s drawing to the narration.'),
  },
}, tool(async ({ project, scene, text: words, audio_path, voice: voiceId, fit_drawing }) => {
  if (!words && !audio_path) throw new Error('Give "text" to speak or an "audio_path".');
  const audio = audio_path ? await readMedia(audio_path, 'audio') : undefined;
  return withProject(project, async (page) => {
    const r = await page.evaluate((o) => window.DrawFlow.addVoiceover(o), { scene, text: audio ? undefined : words, audio, voice: voiceId, fit: fit_drawing });
    const total = await page.evaluate(() => window.DrawFlow.project.duration);
    return text({ scene: r.scene, voiceoverSeconds: r.duration, sceneStarts: +r.start.toFixed(2), sceneEnds: +r.end.toFixed(2), projectDuration: +total.toFixed(2) });
  });
}));

server.registerTool('get_preview', {
  title: 'Preview a frame',
  description: 'A PNG frame of the video: by default the moment a scene is fully drawn, or the frame at a given time. Use it to check layout before rendering.',
  inputSchema: {
    project: z.string().describe('Project title, file name or path.'),
    scene: z.string().optional().describe('Scene name, id or number; omit for the last frame of the video.'),
    time: z.number().min(0).optional().describe('An exact time in seconds instead.'),
    height: z.number().int().min(180).max(1080).default(540).describe('Image height in pixels.'),
  },
}, tool(async ({ project, scene, time, height }) => withProject(project, async (page) => {
  const r = await page.evaluate((o) => window.DrawFlow.previewBase64(o), { scene, time, height });
  return { content: [{ type: 'image', data: r.base64, mimeType: 'image/png' }, { type: 'text', text: `Frame at ${r.time} s${scene && time === undefined ? ` (scene ${scene} fully drawn)` : ''}.` }] };
}, { save: false })));

server.registerTool('render', {
  title: 'Render the video',
  description: 'Render the project to a video file with the same renderer as the editor\'s Export button (audio included). Takes roughly real time for 1080p; progress is reported while it runs.',
  inputSchema: {
    project: z.string().describe('Project title, file name or path.'),
    output_path: z.string().optional().describe('Where to write the file (default: next to the project, same name).'),
    format: z.enum(['mp4', 'webm', 'gif']).default('mp4'),
    height: z.number().int().min(144).max(4320).optional().describe('Output height in pixels (default: the project\'s resolution).'),
    scene: z.string().optional().describe('Render one scene only (name or id).'),
  },
}, tool(async ({ project, output_path, format, height, scene }, extra) => withProject(project, async (page, file) => {
  const out = path.resolve(output_path ?? file.replace(/\.drawflow\.json$/i, `${scene ? `-${slug(scene)}` : ''}.${format}`));
  await mkdir(path.dirname(out), { recursive: true });
  const token = extra?._meta?.progressToken;
  const ticker = token === undefined ? null : setInterval(async () => {
    try {
      const p = await page.evaluate(() => window.DrawFlow.store.getState().exportProgress);
      await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: Math.round(p * 100), total: 100 } });
    } catch { /* page busy */ }
  }, 1000);
  try {
    const r = await page.evaluate((o) => window.DrawFlow.renderBase64(o), { format, height, scene });
    await writeFile(out, Buffer.from(r.base64, 'base64'));
    const info = await page.evaluate(() => ({ duration: window.DrawFlow.project.duration, exportHeight: window.DrawFlow.project.exportHeight ?? 1080 }));
    return text({ file: out, format, height: height ?? info.exportHeight, seconds: +info.duration.toFixed(2), sizeMB: +(r.sizeBytes / 1048576).toFixed(2), renderSeconds: +(r.elapsedMs / 1000).toFixed(1), encoder: r.engine });
  } finally {
    if (ticker) clearInterval(ticker);
  }
}, { save: false })));

server.registerTool('list_projects', {
  title: 'List projects',
  description: `The DrawFlow projects in ${PROJECTS}.`,
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, tool(async () => {
  const rows = [];
  for (const f of await projectFiles()) {
    try {
      const j = JSON.parse(await readFile(f, 'utf8'));
      rows.push({ project: path.basename(f, '.drawflow.json'), title: j.project?.name, scenes: (j.project?.scenes ?? []).length, seconds: +(j.project?.duration ?? 0).toFixed(1), modified: (await stat(f)).mtime.toISOString(), file: f });
    } catch {
      rows.push({ project: path.basename(f, '.drawflow.json'), error: 'unreadable', file: f });
    }
  }
  return text(rows.length ? rows : `No projects yet in ${PROJECTS} — create one with create_project.`);
}));

server.registerTool('get_project', {
  title: 'Describe a project',
  description: 'Settings, scenes (with timing, items and voiceovers) and total length of a project.',
  inputSchema: { project: z.string().describe('Project title, file name or path.') },
  annotations: { readOnlyHint: true },
}, tool(async ({ project }) => withProject(project, async (page, file, problems) => {
  const d = await page.evaluate(() => window.DrawFlow.describe());
  return text({ file, ...d, ...(problems.length ? { fixedOnLoad: problems } : {}) });
}, { save: false })));

server.registerTool('list_voices', {
  title: 'List built-in voices',
  description: 'Voices for text voiceovers (add_voiceover). English, US and UK; offline and free.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, tool(async () => {
  const { page } = await session();
  return text(await page.evaluate(() => window.DrawFlow.voices));
}));

const shutdown = async () => { try { await app?.close(); } finally { process.exit(0); } };
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
log(`ready — projects in ${PROJECTS}`);
