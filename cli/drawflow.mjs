#!/usr/bin/env node
// DrawFlow command line: render, preview, validate and benchmark projects
// without opening the editor. The built app (dist/) is served locally and
// driven in headless Chromium through window.DrawFlow, so the CLI produces
// exactly what the editor's Export button produces.
//
//   drawflow create <name>                       write an empty <name>.drawflow.json
//   drawflow render <file...> [options]           render one or more projects
//   drawflow preview <file>                       open a project in a browser window
//   drawflow validate <file>                      report problems in a project file
//   drawflow bench [--height 1080]                measure paint/encode speed on this machine
//   drawflow examples [dir]                       write the built-in templates as project files
//
// Render options:
//   -o, --out <path>       output file (default: next to the project)
//   --format mp4|webm|gif|png-sequence   (default mp4)
//   --height <px>          720 | 1080 | 1440 | 2160 | any even number (default 1080)
//   --scene <name>         render one scene only
//   --lanes <n>            concurrent encoders (default: physical cores)
//   --browser <path>       Chromium/Chrome/Edge executable to use
//   --keep-open            leave the browser open afterwards (debugging)

import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (['keep-open', 'headed', 'help', 'json'].includes(k)) args[k] = true;
      else args[k] = argv[++i];
    } else args._.push(a);
  }
  return args;
}

/** Serve dist/ with the isolation headers the fallback encoder needs. */
function serveDist() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      try {
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      } catch {
        file = path.join(DIST, 'index.html'); // SPA fallback
      }
      try {
        const data = await readFile(file);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function launchBrowser({ headed = false, executable } = {}) {
  let pw;
  try {
    pw = await import('playwright-core');
  } catch {
    fail('playwright-core is not installed. Run `npm install` in the DrawFlow folder.');
  }
  const opts = { headless: !headed, args: ['--autoplay-policy=no-user-gesture-required'] };
  // ELECTRON_RUN_AS_NODE leaks in from some editors and would break a launched Electron; harmless for Chrome
  const tries = executable ? [{ executablePath: executable }] : [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }, {}];
  let lastErr;
  for (const t of tries) {
    try { return await pw.chromium.launch({ ...opts, ...t }); } catch (e) { lastErr = e; }
  }
  fail(`No Chromium-based browser found (tried Chrome, Edge and Playwright's Chromium).\n` +
    `Install Google Chrome or Microsoft Edge, or run \`npx playwright install chromium\`, or pass --browser <path>.\n${lastErr?.message ?? ''}`);
}

function fail(msg) {
  console.error(`\x1b[31m${msg}\x1b[0m`);
  process.exit(1);
}

function log(msg) { process.stdout.write(msg + '\n'); }

async function openApp(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60000 });
}

async function withApp({ headed = false, executable, keepOpen = false } = {}, fn) {
  if (!existsSync(path.join(DIST, 'index.html'))) fail('dist/ not found — run `npm run build` first.');
  const { server, url } = await serveDist();
  const browser = await launchBrowser({ headed, executable });
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
    await openApp(page, url);
    return await fn(page, url);
  } finally {
    if (!keepOpen) { await browser.close(); server.close(); }
  }
}

// --- commands ----------------------------------------------------------------

async function cmdCreate(args) {
  const name = args._[1] ?? 'untitled';
  const file = name.endsWith('.json') ? name : `${name}.drawflow.json`;
  if (existsSync(file)) fail(`${file} already exists.`);
  const project = {
    app: 'drawflow', format: 2, savedAt: Date.now(),
    project: { name: path.basename(name, '.drawflow.json'), width: 1920, height: 1080, fps: 30, background: '#ffffff', paper: 'plain', duration: 3, hand: 'marker', cameraEasing: 'easeOut', cameraFill: 0.5, zoomAtEnd: false, endHold: 1.5, scenes: [], markers: [] },
    elements: [], audioClips: [], sources: [],
  };
  await writeFile(file, JSON.stringify(project, null, 2));
  log(`Created ${file}`);
}

async function cmdValidate(args) {
  const files = args._.slice(1);
  if (!files.length) fail('validate: give at least one .drawflow.json');
  await withApp({ executable: args.browser }, async (page) => {
    for (const f of files) {
      const json = await readFile(f, 'utf8');
      const r = await page.evaluate((j) => window.DrawFlow.loadProject(j), json).catch((e) => ({ error: String(e.message ?? e) }));
      if (r.error) { log(`${f}: \x1b[31minvalid\x1b[0m — ${r.error}`); continue; }
      const info = await page.evaluate(() => { const p = window.DrawFlow.project; return { name: p.name, elements: window.DrawFlow.elements.length, duration: p.duration, scenes: (p.scenes ?? []).length }; });
      log(`${f}: ${r.problems.length ? `\x1b[33m${r.problems.length} fix${r.problems.length === 1 ? '' : 'es'}\x1b[0m` : '\x1b[32mok\x1b[0m'} — "${info.name}", ${info.elements} elements, ${info.duration.toFixed(1)} s, ${info.scenes} scenes`);
      for (const p of r.problems) log(`   • ${p}`);
    }
  });
}

async function cmdRender(args) {
  const files = args._.slice(1);
  if (!files.length) fail('render: give at least one .drawflow.json');
  const format = args.format ?? 'mp4';
  const height = parseInt(args.height ?? '1080', 10);
  const ext = { mp4: 'mp4', webm: 'webm', gif: 'gif', 'png-sequence': 'zip' }[format];
  if (!ext) fail(`Unknown format "${format}". Use mp4, webm, gif or png-sequence.`);
  if (files.length > 1 && args.out && !args.out.endsWith(path.sep) && !existsSync(args.out)) {
    // several inputs with one --out: treat it as a folder
    await mkdir(args.out, { recursive: true });
  }
  await withApp({ executable: args.browser, keepOpen: !!args['keep-open'] }, async (page) => {
    if (args.lanes) await page.evaluate((n) => localStorage.setItem('drawflow.exportLanes', String(n)), args.lanes);
    for (const f of files) {
      const json = await readFile(f, 'utf8');
      const t0 = Date.now();
      const load = await page.evaluate((j) => window.DrawFlow.loadProject(j), json);
      for (const p of load.problems) log(`   • ${p}`);
      const info = await page.evaluate(() => ({ name: window.DrawFlow.project.name, duration: window.DrawFlow.project.duration, fps: window.DrawFlow.project.fps }));
      log(`Rendering "${info.name}" (${info.duration.toFixed(1)} s @ ${info.fps} fps) → ${format} ${height}p${args.scene ? `, scene "${args.scene}"` : ''}`);
      // progress ticker
      const ticker = setInterval(async () => {
        try {
          const p = await page.evaluate(() => window.DrawFlow.store.getState().exportProgress);
          process.stdout.write(`\r   ${Math.round(p * 100)}%   `);
        } catch { /* page busy */ }
      }, 500);
      let result;
      try {
        result = await page.evaluate(
          (o) => window.DrawFlow.renderBase64(o),
          { format, height, scene: args.scene },
        );
      } finally {
        clearInterval(ticker);
        process.stdout.write('\r');
      }
      const base = path.basename(f).replace(/\.drawflow\.json$|\.json$/i, '');
      let out;
      if (!args.out) out = path.join(path.dirname(f), `${base}${args.scene ? `-${args.scene.replace(/[^\w-]+/g, '_')}` : ''}.${ext}`);
      else if (files.length > 1 || existsSync(args.out) && (await stat(args.out)).isDirectory()) out = path.join(args.out, `${base}.${ext}`);
      else out = args.out;
      await writeFile(out, Buffer.from(result.base64, 'base64'));
      log(`   ✓ ${out}  (${(result.sizeBytes / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s, ${result.engine})`);
    }
  });
}

async function cmdPreview(args) {
  const f = args._[1];
  if (!f) fail('preview: give a .drawflow.json');
  const json = await readFile(f, 'utf8');
  log('Opening the editor… close the window to finish.');
  await withApp({ headed: true, executable: args.browser, keepOpen: false }, async (page) => {
    await page.evaluate((j) => window.DrawFlow.loadProject(j), json);
    await page.evaluate(() => { const s = window.DrawFlow.store.getState(); s.setTime(0); s.play(); });
    await page.waitForEvent('close', { timeout: 0 }).catch(() => undefined);
  });
}

async function cmdBench(args) {
  const height = parseInt(args.height ?? '1080', 10);
  await withApp({ executable: args.browser }, async (page) => {
    await page.evaluate(() => window.DrawFlow.newFromTemplate('explainer'));
    const r = await page.evaluate((h) => window.DrawFlow.bench(h, 8), height);
    log(`Machine: ${cpus()[0]?.model ?? 'unknown CPU'} (${cpus().length} threads)`);
    log(`Frames: ${r.frames} at ${r.size} — paint ${r.paintMsPerFrame} ms/frame`);
    log(`Encode (canvas frames):  1 lane ${r.canvas1} fps · 2 lanes ${r.canvas2} fps · 3 lanes ${r.canvas3} fps`);
    log(`Encode (buffer frames):  1 lane ${r.buffer1} fps · 2 lanes ${r.buffer2} fps · 3 lanes ${r.buffer3} fps`);
    if (args.json) log(JSON.stringify(r));
  });
}

async function cmdExamples(args) {
  const dir = args._[1] ?? 'examples';
  await mkdir(dir, { recursive: true });
  await withApp({ executable: args.browser }, async (page) => {
    const ids = await page.evaluate(() => window.DrawFlow.templates.map((t) => t.id));
    for (const id of ids) {
      await page.evaluate((i) => window.DrawFlow.newFromTemplate(i), id);
      const json = await page.evaluate(() => window.DrawFlow.saveProject());
      const out = path.join(dir, `${id}.drawflow.json`);
      await writeFile(out, json);
      log(`   ✓ ${out}`);
    }
  });
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const commands = { create: cmdCreate, render: cmdRender, preview: cmdPreview, validate: cmdValidate, bench: cmdBench, examples: cmdExamples };
if (!cmd || args.help || !commands[cmd]) {
  log(`DrawFlow CLI

  drawflow create <name>
  drawflow render <file...> [-o out] [--format mp4|webm|gif|png-sequence] [--height 1080] [--scene <name>] [--lanes n]
  drawflow preview <file>
  drawflow validate <file...>
  drawflow bench [--height 1080] [--json]
  drawflow examples [dir]

Needs a built app (npm run build) and Chrome, Edge or Playwright's Chromium.`);
  process.exit(cmd && !commands[cmd] ? 1 : 0);
}
commands[cmd](args).catch((e) => fail(e?.stack ?? String(e)));
