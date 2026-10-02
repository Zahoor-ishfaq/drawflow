// A headless DrawFlow: the built app (dist/) served locally and opened in a
// Chromium-based browser, driven through window.DrawFlow. Shared by the CLI
// (cli/drawflow.mjs) and the MCP server (mcp/server.mjs), so both produce
// exactly what the editor's Export button produces.
//
// Errors are thrown (never process.exit) so a long-running caller survives them.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};

/** Serve dist/ with the isolation headers the fallback encoder needs. */
export function serveDist() {
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

export async function launchBrowser({ headed = false, executable } = {}) {
  let pw;
  try {
    pw = await import('playwright-core');
  } catch {
    throw new Error('playwright-core is not installed. Run `npm install` in the DrawFlow folder.');
  }
  const opts = { headless: !headed, args: ['--autoplay-policy=no-user-gesture-required'] };
  const tries = executable ? [{ executablePath: executable }] : [{ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chromium' }, {}];
  let lastErr;
  for (const t of tries) {
    try { return await pw.chromium.launch({ ...opts, ...t }); } catch (e) { lastErr = e; }
  }
  throw new Error(`No Chromium-based browser found (tried Chrome, Edge and Playwright's Chromium).\n` +
    `Install Google Chrome or Microsoft Edge, or run \`npx playwright install chromium\`, or pass --browser <path>.\n${lastErr?.message ?? ''}`);
}

export async function openApp(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60000 });
}

/**
 * Open the app in a fresh browser and return { page, close }. `prepare(context)`
 * runs before the page loads (e.g. to expose functions to it).
 */
export async function startApp({ headed = false, executable, onPageError, prepare } = {}) {
  if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ not found — run `npm run build` in the DrawFlow folder first.');
  const { server, url } = await serveDist();
  let browser;
  try {
    browser = await launchBrowser({ headed, executable });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    if (prepare) await prepare(context);
    const page = await context.newPage();
    if (onPageError) page.on('pageerror', onPageError);
    await openApp(page, url);
    return { page, browser, url, close: async () => { await browser.close().catch(() => {}); server.close(); } };
  } catch (e) {
    await browser?.close().catch(() => {});
    server.close();
    throw e;
  }
}
