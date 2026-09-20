import { test, expect } from '@playwright/test';
import { openApp, addText, elements, project } from './helpers.mjs';

test.describe('editor', () => {
  test('adds elements that chain on the timeline', async ({ page }) => {
    await openApp(page);
    await addText(page, 'Alpha', 1);
    await addText(page, 'Beta', 2);
    const els = await elements(page);
    expect(els.map((e) => e.label)).toEqual(['Alpha', 'Beta']);
    expect(els[0].start).toBe(0);
    expect(els[1].start).toBeGreaterThan(els[0].draw);
    expect((await project(page)).duration).toBeGreaterThan(els[1].start);
  });

  test('multi-select, nudge, copy/paste, group and ungroup', async ({ page }) => {
    await openApp(page);
    await addText(page, 'One', 1);
    await addText(page, 'Two', 2);
    await addText(page, 'Three', 3);
    await page.keyboard.press('Escape');
    await page.locator('.dotted-ground').click({ position: { x: 700, y: 60 } });
    await page.keyboard.press('Control+a');
    await expect(page.locator('aside span.truncate').first()).toHaveText('3 elements');
    const before = (await elements(page)).map((e) => e.x);
    await page.keyboard.press('Shift+ArrowRight');
    const after = (await elements(page)).map((e) => e.x);
    expect(after.map((x, i) => x - before[i])).toEqual([10, 10, 10]);

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    expect((await elements(page)).length).toBe(6);
    await page.keyboard.press('Delete');
    expect((await elements(page)).length).toBe(3);

    const ids = (await elements(page)).map((e) => e.id);
    await page.evaluate((ids) => window.DrawFlow.store.getState().selectMany(ids), ids.slice(0, 2));
    await page.keyboard.press('Control+g');
    expect((await elements(page)).map((e) => e.label)).toEqual(['Group (2)', 'Three']);
    await page.keyboard.press('Control+Shift+g');
    expect((await elements(page)).map((e) => e.label)).toEqual(['One', 'Two', 'Three']);
  });

  test('lock, hide, layers and undo', async ({ page }) => {
    await openApp(page);
    await addText(page, 'Locked', 1);
    await page.locator('.dotted-ground').click({ position: { x: 700, y: 60 } });
    const id = (await elements(page))[0].id;
    await page.evaluate((id) => window.DrawFlow.store.getState().select(id), id);
    // rapid changes are merged into one undo step (250 ms), so space them out
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+l');
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+Shift+h');
    await page.waitForTimeout(350);
    await page.keyboard.press(']');
    await page.waitForTimeout(350);
    let el = (await elements(page))[0];
    expect([el.locked, el.hidden, el.layer]).toEqual([true, true, 1]);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(350);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(350);
    el = (await elements(page))[0];
    expect([el.locked, el.hidden, el.layer]).toEqual([false, false, 0]);
  });

  test('scenes and markers', async ({ page }) => {
    await openApp(page);
    await addText(page, 'A', 1);
    await addText(page, 'B', 2);
    await page.getByRole('button', { name: /^Scenes$/ }).click();
    await page.getByRole('button', { name: 'Add scene' }).click();
    await page.keyboard.press('Escape');
    expect((await project(page)).scenes).toEqual(['Scene 1', 'Scene 2']);
    const ids = (await elements(page)).map((e) => e.id);
    const scene2 = await page.evaluate(() => window.DrawFlow.project.scenes[1].id);
    await page.evaluate(([ids, sc]) => window.DrawFlow.store.getState().assignScene(ids, sc), [[ids[1]], scene2]);
    const els = await elements(page);
    expect(els[1].scene).toBe(scene2);
    await page.locator('.dotted-ground').click({ position: { x: 700, y: 60 } });
    await page.keyboard.press('m');
    expect((await project(page)).markers).toBe(1);
  });
});
