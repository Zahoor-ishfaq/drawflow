// Offline voice: the Voice panel's Offline tab explains what to install when
// no voice app is running (a popup, not an error), connects once one is,
// speaks through it onto the voice lane, and goes back to the popup when the
// app disappears. A small stand-in server plays VoiceStudio
// (OpenAI /audio/speech + /audio/voices).

import { test, expect } from '@playwright/test';
import http from 'node:http';
import { openApp } from './helpers.mjs';

const PORT = 3911;

/** Half a second of a quiet tone as 16-bit mono WAV. */
function toneWav(rate = 24000, seconds = 0.5) {
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

function startVoiceApp(requests) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Private-Network': 'true' };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    if (req.method === 'GET' && req.url === '/v1/audio/voices') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ voices: [
        { voice_id: 'alloy', name: 'Alloy', type: 'openai_alias' },
        { voice_id: 'echo', name: 'Echo', type: 'openai_alias' },
        { voice_id: 'vp_123', name: 'My clone', type: 'profile', language: 'en' },
      ], engines: [] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/audio/speech') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        requests.push(JSON.parse(body));
        res.writeHead(200, { ...cors, 'Content-Type': 'audio/wav' });
        res.end(toneWav());
      });
      return;
    }
    res.writeHead(404, cors); res.end('{"detail":"Not Found"}');
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

test('offline voice: setup popup, connect, speak onto the voice lane', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.removeItem('drawflow.ai'));
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60_000 });

  // nothing installed: the Offline tab opens the setup popup — what to download and how it works
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await page.getByRole('tab', { name: 'Offline (free)' }).click();
  const guide = page.getByRole('dialog', { name: 'Offline voice — set up once' });
  await expect(guide).toBeVisible();
  await expect(guide.getByText('No voice app is running on this computer yet')).toBeVisible();
  await expect(guide.getByRole('link', { name: 'Download VoiceStudio' })).toHaveAttribute('href', 'https://github.com/debpalash/VoiceStudio/releases/latest');
  await expect(guide.getByRole('link', { name: 'Download qwentts.cpp' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0); // no error dialog

  // the app is started: point the popup at it and check again
  const requests = [];
  const server = await startVoiceApp(requests);
  try {
    await guide.getByRole('button', { name: 'The app uses a different address?' }).click();
    await guide.getByPlaceholder('http://127.0.0.1:3900/v1').fill(`http://127.0.0.1:${PORT}`);
    await guide.getByRole('button', { name: 'Check again' }).click();
    await expect(guide.getByText(/Connected to your voice app — 2 voices ready/)).toBeVisible();
    await guide.getByRole('button', { name: 'Start using it' }).click();
    await expect(guide).toBeHidden();

    await expect(page.getByText('Connected to your voice app on this computer')).toBeVisible();
    await page.locator('select:has(option[value="vp_123"])').selectOption('vp_123');
    await page.getByPlaceholder('What should the voice say?').fill('Hello from a voice on this computer.');
    await page.getByRole('button', { name: /Generate offline voice at/ }).click();

    await page.waitForFunction(() => window.DrawFlow.store.getState().audioClips.some((c) => c.lane === 'voice'), null, { timeout: 30_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: 'tts-1', voice: 'vp_123', input: 'Hello from a voice on this computer.', response_format: 'wav' });

    // once connected it is a narration choice for scripts too
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drawflow.ai')).localVoice);
    expect(saved.enabled).toBe(true);
    expect(saved.voices.map((v) => v.id)).toEqual(['default', 'vp_123']);
  } finally {
    server.close();
  }

  // the app was closed: Generate brings the setup popup back instead of an error
  await page.getByPlaceholder('What should the voice say?').fill('Is anyone there?');
  await page.getByRole('button', { name: /Generate offline voice at/ }).click();
  await expect(guide).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('the Online tab is unchanged and points to Offline when there is no key', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.removeItem('drawflow.ai'));
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Online' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Online voices need an OpenAI, Groq or Gemini key')).toBeVisible();

  // with a key the usual service and voice pickers appear
  await page.evaluate(() => localStorage.setItem('drawflow.ai', JSON.stringify({ keys: { groq: 'gsk_test' } })));
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await expect(page.locator('select:has(option[value="groq"])')).toHaveValue('groq');
  await expect(page.locator('select:has(option[value="troy"])')).toBeVisible();
});
