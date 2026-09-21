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
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

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
