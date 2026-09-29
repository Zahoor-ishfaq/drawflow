// Desktop shell for DrawFlow. Its only job is to open a window and serve the
// built web app from a custom `app://` scheme.
//
// Why a custom scheme instead of file://: video export uses ffmpeg.wasm, which
// needs SharedArrayBuffer, which the browser only grants to a cross-origin
// isolated page. Isolation requires COOP/COEP response headers, and file://
// URLs carry no headers at all. Serving our own scheme lets us set them.
//
// CommonJS (.cjs) on purpose: this package is "type": "module", and in an ESM
// main process the bare specifier 'electron' resolves to the npm package
// (a path string) rather than the built-in module.
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');

const SCHEME = 'app';
const DEV_SERVER_URL = process.argv.includes('--dev') ? 'http://localhost:5173' : null;

// Headers that make the page cross-origin isolated (mirrors vite.config.ts).
// The CSP allows what the editor genuinely needs: wasm compilation and blob:
// scripts/workers for ffmpeg.wasm, data: URIs for rasterized canvas frames.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://api.anthropic.com https://api.openai.com https://api.groq.com https://generativelanguage.googleapis.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const RESPONSE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function serveBuiltApp() {
  // Derived from __dirname rather than app.getAppPath(), which varies with how
  // Electron was launched. fs.promises is asar-aware, so this one path works
  // both unpackaged and inside the packaged archive.
  const root = path.join(__dirname, '..', 'dist');

  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const decoded = decodeURIComponent(pathname);

    // Resolve inside `root` and reject anything that escapes it.
    const candidate = path.normalize(path.join(root, decoded));
    const withinRoot = candidate === root || candidate.startsWith(root + path.sep);

    // Unknown non-asset paths fall through to index.html so the SPA can route.
    const target = withinRoot && path.extname(candidate) ? candidate : path.join(root, 'index.html');

    try {
      const body = await fs.readFile(target);
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': type, ...RESPONSE_HEADERS },
      });
    } catch (error) {
      if (error.code === 'ENOENT') return new Response('Not found', { status: 404 });
      throw error;
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#e9edf2',
    title: 'DrawFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Anything that isn't the app itself opens in the real browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(DEV_SERVER_URL || `${SCHEME}://drawflow/`);
  if (DEV_SERVER_URL) win.webContents.openDevTools();

  return win;
}

/** Tell the page to run one of its project actions (see ProjectMenu.tsx). */
function sendMenu(action, payload) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('drawflow:menu', { action, ...payload });
}

/** File → Open file…: the native dialog reads the .drawflow.json, the page opens it as a new project. */
async function openProjectFile() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open a DrawFlow project',
    filters: [{ name: 'DrawFlow project', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return;
  const text = await fs.readFile(filePaths[0], 'utf8');
  sendMenu('open-file', { name: path.basename(filePaths[0]), text });
}

/** File → Save to file…: the page hands over the JSON, we write where the user says. */
ipcMain.handle('drawflow:save-file', async (event, { filename, text }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save the project as a file',
    defaultPath: filename,
    filters: [{ name: 'DrawFlow project', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  await fs.writeFile(filePath, text, 'utf8');
  return true;
});

/** This computer or the home network: the only places a local voice app can live. */
function isLocalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '::1' || h.endsWith('.local')
    || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

// Local voice apps (VoiceStudio, qwentts.cpp…): the page's CSP only lets it
// reach the cloud providers, and those apps' CORS lists don't include app://,
// so their requests are relayed from here — to local addresses only.
ipcMain.handle('drawflow:local-fetch', async (_event, { url, method, headers, body }) => {
  let target;
  try { target = new URL(url); } catch { return { error: `Not a valid address: ${url}` }; }
  if (!/^https?:$/.test(target.protocol) || !isLocalHost(target.hostname)) {
    return { error: `Only addresses on this computer or your home network can be used for a local voice app (got ${target.host}).` };
  }
  try {
    // generating a long take on a CPU can take minutes
    const res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(10 * 60 * 1000) });
    return {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type') || '',
      body: new Uint8Array(await res.arrayBuffer()),
    };
  } catch (error) {
    const cause = error && error.cause && (error.cause.code || error.cause.message);
    return { error: `Failed to fetch ${target.origin}${cause ? ` (${cause})` : ''}`, unreachable: true };
  }
});

// The built-in offline voice (Kokoro), run in a utility process — see
// voice-worker.cjs. Packaged builds use the single-file bundle made by
// scripts/build-voice-worker.mjs; development runs the source directly.
const VOICE_MODELS = () => path.join(app.getPath('userData'), 'models');
const VOICE_MODEL_FILE = 'onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx';
let voiceWorker = null;
let voiceSeq = 0;
const voiceJobs = new Map(); // id → { resolve, onProgress }

function startVoiceWorker() {
  const bundled = path.join(__dirname, 'voice', 'worker.cjs');
  const script = !DEV_SERVER_URL && existsSync(bundled) ? bundled : path.join(__dirname, 'voice-worker.cjs');
  const child = utilityProcess.fork(script, [], {
    serviceName: 'DrawFlow voice',
    env: { ...process.env, DRAWFLOW_MODELS: VOICE_MODELS() },
    stdio: 'ignore',
  });
  child.on('message', (msg) => {
    const job = voiceJobs.get(msg.id);
    if (!job) return;
    if (msg.type === 'progress') { job.onProgress(msg.loaded, msg.total); return; }
    voiceJobs.delete(msg.id);
    job.resolve(msg.type === 'done' ? { wav: msg.wav } : { error: msg.message });
  });
  child.on('exit', () => {
    if (voiceWorker === child) voiceWorker = null;
    for (const job of voiceJobs.values()) job.resolve({ error: 'The built-in voice stopped unexpectedly. Try again.' });
    voiceJobs.clear();
  });
  return child;
}

/** Speak with the built-in voice; resolves { wav } or { error }. Progress is the one-time model download. */
ipcMain.handle('drawflow:voice-speak', (event, { text, voice, speed }) => {
  if (!voiceWorker) voiceWorker = startVoiceWorker();
  const id = ++voiceSeq;
  return new Promise((resolve) => {
    voiceJobs.set(id, {
      resolve,
      onProgress: (loaded, total) => { if (!event.sender.isDestroyed()) event.sender.send('drawflow:voice-progress', { loaded, total }); },
    });
    voiceWorker.postMessage({ id, type: 'speak', text, voice, speed });
  });
});

/** Has the built-in voice's model been downloaded already? */
ipcMain.handle('drawflow:voice-status', () => ({ downloaded: existsSync(path.join(VOICE_MODELS(), VOICE_MODEL_FILE)) }));

app.on('will-quit', () => { if (voiceWorker) voiceWorker.kill(); });

// The application menu: the default Edit / View / Window menus, plus a File
// menu with the project actions the web app keeps under "Saved…".
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New project', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new-project') },
        { label: 'New from template…', click: () => sendMenu('templates') },
        { type: 'separator' },
        { label: 'Open file…', accelerator: 'CmdOrCtrl+Shift+O', click: () => void openProjectFile() },
        { label: 'Projects, templates & history…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('projects') },
        { type: 'separator' },
        { label: 'Save checkpoint now', click: () => sendMenu('save-now') },
        { label: 'Save version…', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save-version') },
        { label: 'Save project as template…', click: () => sendMenu('save-template') },
        { label: 'Save to file…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-file') },
        { type: 'separator' },
        { label: 'Download video…', accelerator: 'CmdOrCtrl+E', click: () => sendMenu('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'User guide', click: () => shell.openExternal('https://github.com/Zahoor-ishfaq/drawflow/blob/main/docs/user-guide.md') },
        { label: 'Report a problem', click: () => shell.openExternal('https://github.com/Zahoor-ishfaq/drawflow/issues') },
        { label: 'DrawFlow on GitHub', click: () => shell.openExternal('https://github.com/Zahoor-ishfaq/drawflow') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (!DEV_SERVER_URL) serveBuiltApp();
  buildMenu();
  createWindow();

  // macOS keeps the process alive with no windows; reopen on dock click.
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
