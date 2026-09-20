import { test, expect } from '@playwright/test';
import { openApp, addText, elements, project } from './helpers.mjs';

test.describe('projects and files', () => {
  test('autosaves, survives a reload and round-trips through a file', async ({ page }) => {
    await openApp(page);
    await addText(page, 'Persist me', 1);
    await page.waitForTimeout(2500); // autosave debounce
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.DrawFlow?.elements.length === 1, null, { timeout: 60_000 });
    expect((await elements(page))[0].label).toBe('Persist me');

    const json = await page.evaluate(() => window.DrawFlow.saveProject());
    expect(JSON.parse(json).app).toBe('drawflow');
    await page.evaluate(() => window.DrawFlow.store.getState().newProject());
    expect((await elements(page)).length).toBe(0);
    const { problems } = await page.evaluate((j) => window.DrawFlow.loadProject(j), json);
    expect(problems).toEqual([]);
    expect((await elements(page))[0].label).toBe('Persist me');
  });

  test('templates build multi-scene projects and versions restore', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.DrawFlow.newFromTemplate('explainer'));
    await page.waitForFunction(() => window.DrawFlow.elements.length > 5);
    const p = await project(page);
    expect(p.scenes.length).toBe(4);
    expect(p.duration).toBeGreaterThan(20);
  });

  test('the validator repairs a broken file instead of refusing it', async ({ page }) => {
    await openApp(page);
    const broken = JSON.stringify({
      app: 'drawflow', format: 2, project: { name: 'Broken', fps: 17 },
      elements: [
        { id: 'a', kind: 'text', label: 'ok', paths: ['M0 0L10 10'], x: 1, y: 1 },
        { id: 'a', kind: 'text', label: 'dup', paths: ['M0 0L10 10'] },
        { id: 'b', kind: 'image', label: 'no picture' },
        { id: 'c', paths: 'not-an-array' },
      ],
      audioClips: [{ id: 'x' }],
    });
    const { problems } = await page.evaluate((j) => window.DrawFlow.loadProject(j), broken);
    expect(problems.length).toBeGreaterThanOrEqual(4);
    const els = await elements(page);
    expect(els.length).toBe(2);
    expect((await project(page)).name).toBe('Broken');
  });
});
