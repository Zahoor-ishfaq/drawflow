import { test, expect } from '@playwright/test';
import { openApp, addText, downloadedBytes } from './helpers.mjs';

async function runExport(page, format, size) {
  await page.getByRole('button', { name: 'Download video' }).click();
  await page.getByText('Start export').waitFor();
  await page.getByText(format, { exact: true }).click();
  await page.getByText(size, { exact: true }).click();
  await page.getByRole('button', { name: 'Start export' }).click();
  await expect(page.getByText(/^Done — /)).toBeVisible({ timeout: 170_000 });
  const bytes = await downloadedBytes(page);
  await page.getByRole('button', { name: 'Export another' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  return bytes;
}

test.describe('export', () => {
  test('MP4 is a real H.264 file with the right length', async ({ page }) => {
    await openApp(page);
    await addText(page, 'Export me', 1);
    await addText(page, 'Twice', 2);
    const bytes = await runExport(page, 'MP4', '720p');
    expect(bytes.length).toBeGreaterThan(20_000);
    // ftyp box near the start, avc1 sample entry somewhere in the moov
    expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(bytes.includes(Buffer.from('avc1'))).toBe(true);
  });

  test('WebM, GIF and snapshot exports produce their formats', async ({ page }) => {
    await openApp(page);
    await addText(page, 'Formats', 1);
    const webm = await runExport(page, 'WebM', '720p');
    expect(webm.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])); // EBML header
    const gif = await runExport(page, 'GIF', '720p');
    expect(gif.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    const png = await runExport(page, 'Snapshot', '720p');
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  test('the scripting API renders too', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.DrawFlow.newFromTemplate('youtube-intro'));
    await page.waitForFunction(() => window.DrawFlow.elements.length > 2);
    const r = await page.evaluate(() => window.DrawFlow.renderBase64({ format: 'mp4', height: 720 }));
    expect(r.sizeBytes).toBeGreaterThan(20_000);
    expect(r.engine).toBe('webcodecs');
  });
});
