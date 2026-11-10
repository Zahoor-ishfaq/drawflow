// Motion paths (issue #3): an element — here an animated GIF, like a bird — travels
// along a route after it appears, in the live preview and in the exported video,
// can turn to face where it goes, is drawn by clicking on the board, and survives
// saving and loading.

import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { openApp } from './helpers.mjs';

const { GIFEncoder } = createRequire(import.meta.url)('gifenc');

/** A GIF whose left half is `left` and right half `right` (two frames, so it animates). */
function makeGif(width, height, left, right) {
  const gif = GIFEncoder();
  const index = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) index[y * width + x] = x < width / 2 ? 0 : 1;
  for (let f = 0; f < 2; f++) gif.writeFrame(index, width, height, { palette: [left, right], delay: 100 });
  gif.finish();
  return Buffer.from(gif.bytes()).toString('base64');
}

const RED = [230, 30, 30];
const BLUE = [30, 30, 230];

/** Page helpers: where the red and the blue pixels are (centroids) in a PNG or in frames of the exported MP4. */
async function installReaders(page) {
  await page.evaluate(() => {
    const centroids = (source, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(source, 0, 0, w, h);
      const { data } = g.getImageData(0, 0, w, h);
      const acc = { red: [0, 0, 0], blue: [0, 0, 0] };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, r = data[i], gr = data[i + 1], b = data[i + 2];
        const k = r > 160 && gr < 110 && b < 110 ? 'red' : b > 160 && r < 110 && gr < 110 ? 'blue' : null;
        if (k) { acc[k][0] += x; acc[k][1] += y; acc[k][2]++; }
      }
      const out = {};
      for (const k of ['red', 'blue']) out[k] = acc[k][2] ? { x: acc[k][0] / acc[k][2], y: acc[k][1] / acc[k][2], n: acc[k][2] } : null;
      return out;
    };
    window.__at = async (time) => {
      const r = await window.DrawFlow.previewBase64({ time, height: 360 });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      return centroids(bmp, bmp.width, bmp.height);
    };
    window.__video = async (times) => {
      const r = await window.DrawFlow.render({ format: 'mp4', height: 360 });
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(r.blob);
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('video would not load')); });
      const out = [];
      for (const t of times) {
        await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; });
        await new Promise((ok) => setTimeout(ok, 200));
        out.push(centroids(v, v.videoWidth, v.videoHeight));
      }
      return out;
    };
  });
}

/** A 640x360 project with one GIF "bird" at a known place, framed by a fixed camera so pixels map 1:1. */
async function birdProject(page, gif, size) {
  return page.evaluate(({ gif, size }) => {
    const d = window.DrawFlow;
    d.newProject({ name: 'Bird', width: 640, height: 360, fps: 30 });
    d.addImage({ src: `data:image/gif;base64,${gif}`, width: size[0], height: size[1] }, 'bird');
    const el = d.elements[d.elements.length - 1];
    d.store.getState().updateElement(el.id, {
      x: 100, y: 200, scale: 1, rotation: 0, style: 'appear', drawDuration: 0.2, pauseAfter: 0.2,
      camera: 'custom', customCamera: { cx: 320, cy: 180, zoom: 1 },
    });
    return el.id;
  }, { gif, size });
}

test('a GIF flies along its motion path, in the preview and in the exported video', async ({ page }) => {
  await openApp(page);
  await installReaders(page);
  const id = await birdProject(page, makeGif(48, 48, RED, RED), [48, 48]);
  // straight to the right by 400 px, then up by 100 px: 500 px of route, 2 s at a constant speed
  const set = await page.evaluate((id) => window.DrawFlow.setMotionPath({ element: id, points: [[400, 0], [400, -100]], duration: 2, easing: 'linear', straight: true }), id);
  expect(set.start).toBeCloseTo(0.2, 2);
  expect(set.end).toBeCloseTo(2.2, 2);
  expect(set.projectDuration).toBeGreaterThanOrEqual(2.2);

  // the bird's centre starts at (124, 224)
  const before = await page.evaluate(() => window.__at(0.15));
  expect(before.red.x).toBeCloseTo(124, -1);
  expect(before.red.y).toBeCloseTo(224, -1);
  // 40% of the way = 200 px along the first leg
  const mid = await page.evaluate(() => window.__at(1.0));
  expect(mid.red.x).toBeCloseTo(324, -1);
  expect(mid.red.y).toBeCloseTo(224, -1);
  // arrived: 400 right, 100 up, and it stays there
  const after = await page.evaluate(() => window.__at(3));
  expect(after.red.x).toBeCloseTo(524, -1);
  expect(after.red.y).toBeCloseTo(124, -1);

  // the exported video agrees with the preview
  const [vMid, vAfter] = await page.evaluate(() => window.__video([1.0, 2.5]));
  expect(Math.abs(vMid.red.x - 324)).toBeLessThan(12);
  expect(Math.abs(vAfter.red.x - 524)).toBeLessThan(12);
  expect(Math.abs(vAfter.red.y - 124)).toBeLessThan(12);

  // the project summary reports it
  const summary = await page.evaluate(() => window.DrawFlow.describe());
  expect(summary.duration).toBeGreaterThanOrEqual(2.2);
});

test('with "turn to face the direction" it turns about its own centre at a bend', async ({ page }) => {
  await openApp(page);
  await installReaders(page);
  // red left half, blue right half: the blue side is its "front"
  const id = await birdProject(page, makeGif(60, 30, RED, BLUE), [60, 30]);
  await page.evaluate((id) => window.DrawFlow.setMotionPath({ element: id, points: [[200, 0], [200, -150]], duration: 2, easing: 'linear', straight: true, orient: true }), id);

  // on the first leg it heads right: red behind (left), blue in front (right)
  const leg1 = await page.evaluate(() => window.__at(0.6));
  expect(leg1.red.x).toBeLessThan(leg1.blue.x);
  expect(Math.abs(leg1.red.y - leg1.blue.y)).toBeLessThan(3);
  // after the bend it heads up: turned a quarter, blue on top, red below…
  const end = await page.evaluate(() => window.__at(3));
  expect(end.blue.y).toBeLessThan(end.red.y - 8);
  expect(Math.abs(end.red.x - end.blue.x)).toBeLessThan(3);
  // …and the turn pivots on its centre, which ends exactly on the last point
  const cx = (end.red.x * end.red.n + end.blue.x * end.blue.n) / (end.red.n + end.blue.n);
  const cy = (end.red.y * end.red.n + end.blue.y * end.blue.n) / (end.red.n + end.blue.n);
  expect(cx).toBeCloseTo(130 + 200, -1);
  expect(cy).toBeCloseTo(215 - 150, -1);
});

test('its front points along the route from the start, whichever way the picture faces', async ({ page }) => {
  await openApp(page);
  await installReaders(page);
  const id = await birdProject(page, makeGif(60, 30, RED, BLUE), [60, 30]);
  // a straight climb up and to the right, at 45°
  const climb = (facing) => page.evaluate(({ id, facing }) => window.DrawFlow.setMotionPath({ element: id, points: [[150, -150]], duration: 2, easing: 'linear', straight: true, orient: true, facing }), { id, facing });

  // picture faces right (blue is its front): blue leads, up and to the right, half way round to vertical
  await climb('right');
  let mid = await page.evaluate(() => window.__at(1.2));
  let dx = mid.blue.x - mid.red.x, dy = mid.blue.y - mid.red.y;
  expect(dx).toBeGreaterThan(5);
  expect(dy).toBeLessThan(-5);
  expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(4);

  // the same picture said to face left (red is its front): now red leads up the climb
  await climb('left');
  mid = await page.evaluate(() => window.__at(1.2));
  dx = mid.red.x - mid.blue.x; dy = mid.red.y - mid.blue.y;
  expect(dx).toBeGreaterThan(5);
  expect(dy).toBeLessThan(-5);
});

test('a motion path is drawn by clicking on the board', async ({ page }) => {
  await openApp(page);
  const id = await birdProject(page, makeGif(48, 48, RED, RED), [48, 48]);
  await page.evaluate((id) => window.DrawFlow.store.getState().select(id), id);

  await page.getByLabel('Travel after it appears').selectOption('draw');
  await expect(page.getByText('Click the board to add points')).toBeVisible();
  expect(await page.evaluate(() => window.DrawFlow.ui.getState().pathEditId)).toBe(id);

  // two clicks on the paper, away from the bird, add two points; Enter finishes
  const box = await page.locator('[data-testid="motion-route"]').locator('..').boundingBox();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.35);
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.6);
  await page.keyboard.press('Enter');

  const motion = await page.evaluate((id) => window.DrawFlow.elements.find((e) => e.id === id).motion, id);
  expect(motion.points).toHaveLength(3);
  expect(motion.points[0]).toEqual({ x: 0, y: 0 });
  expect(motion.points[1].x).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.DrawFlow.ui.getState().pathEditId)).toBeNull();
  // the route is drawn on the board for the selected element
  await expect(page.locator('[data-testid="motion-route"] path').first()).toBeVisible();
  // and the element is still there (Backspace / Enter did not delete it)
  expect(await page.evaluate((id) => window.DrawFlow.elements.some((e) => e.id === id), id)).toBe(true);

  // a ready-made route replaces it; "Stays where it is" removes it
  await page.getByLabel('Travel after it appears').selectOption('wave');
  expect(await page.evaluate((id) => window.DrawFlow.elements.find((e) => e.id === id).motion.points.length, id)).toBe(5);
  await page.getByLabel('Travel after it appears').selectOption('none');
  expect(await page.evaluate((id) => window.DrawFlow.elements.find((e) => e.id === id).motion, id)).toBeNull();
});

test('motion paths save and load, and a broken one is dropped with a note', async ({ page }) => {
  await openApp(page);
  const id = await birdProject(page, makeGif(48, 48, RED, RED), [48, 48]);
  await page.evaluate((id) => window.DrawFlow.setMotionPath({ element: id, points: [[100, -50], [300, 0]], duration: 4, delay: 1, orient: true }), id);
  const json = await page.evaluate(() => window.DrawFlow.saveProject());

  const reloaded = await page.evaluate(async (json) => {
    const r = await window.DrawFlow.loadProject(json);
    return { problems: r.problems, motion: window.DrawFlow.elements[0].motion, duration: window.DrawFlow.project.duration };
  }, json);
  expect(reloaded.problems).toEqual([]);
  expect(reloaded.motion).toMatchObject({ duration: 4, delay: 1, orient: true, easing: 'easeInOut' });
  expect(reloaded.motion.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: -50 }, { x: 300, y: 0 }]);
  expect(reloaded.duration).toBeGreaterThanOrEqual(0.2 + 1 + 4);

  const doc = JSON.parse(json);
  const list = doc.elements ?? doc.document?.elements;
  list[0].motion = { points: [{ x: 0, y: 0 }, { x: 'far', y: null }], duration: 2, delay: 0 };
  const broken = await page.evaluate(async (json) => {
    const r = await window.DrawFlow.loadProject(json);
    return { problems: r.problems, motion: window.DrawFlow.elements[0].motion ?? null };
  }, JSON.stringify(doc));
  expect(broken.motion).toBeNull();
  expect(broken.problems.join(' ')).toContain('motion path');
});
