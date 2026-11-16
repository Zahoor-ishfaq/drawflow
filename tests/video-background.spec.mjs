import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApp } from './helpers.mjs';

// Both clips are 320x180, 3 s at 30 fps, and every frame carries its own number
// in 8 black/white blocks across the top (bit 0 on the left). The MP4 has a sound
// track, the WebM has none.
const MP4 = new URL('./fixtures/numbered.mp4', import.meta.url);
const WEBM = new URL('./fixtures/numbered.webm', import.meta.url);
const b64 = (url) => readFileSync(url).toString('base64');

/** Page helpers: read the frame number from a picture filling the frame, and colours. */
async function installReaders(page) {
  await page.evaluate(() => {
    const canvasOf = (source, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(source, 0, 0, w, h);
      return g;
    };
    /** the number in the blocks of a 320x180 clip stretched over the whole picture */
    const frameNumber = (g, w, h) => {
      let n = 0;
      for (let b = 0; b < 8; b++) {
        const x = Math.round(((16 + b * 36 + 14) / 320) * w), y = Math.round((50 / 180) * h);
        if (g.getImageData(x, y, 1, 1).data[0] > 128) n |= 1 << b;
      }
      return n;
    };
    const decode = async (base64, type) => createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type }));
    window.__pngFrame = async (t) => {
      window.DrawFlow.store.getState().pause();
      window.DrawFlow.store.getState().setTime(t);
      const r = await window.DrawFlow.renderBase64({ format: 'png', height: 360 });
      const bmp = await decode(r.base64, 'image/png');
      return frameNumber(canvasOf(bmp, bmp.width, bmp.height), bmp.width, bmp.height);
    };
    window.__pngPixel = async (t, fx, fy) => {
      window.DrawFlow.store.getState().pause();
      window.DrawFlow.store.getState().setTime(t);
      const r = await window.DrawFlow.renderBase64({ format: 'png', height: 360 });
      const bmp = await decode(r.base64, 'image/png');
      return Array.from(canvasOf(bmp, bmp.width, bmp.height).getImageData(Math.round(fx * bmp.width), Math.round(fy * bmp.height), 1, 1).data.slice(0, 3));
    };
    /** export an MP4 (the fast parallel renderer) and read frames at these output times */
    window.__mp4 = async (times, probe) => {
      const r = await window.DrawFlow.render({ format: 'mp4', height: 360 });
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(r.blob);
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('video would not load')); });
      const out = [];
      for (const t of times) {
        await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; });
        const g = canvasOf(v, v.videoWidth, v.videoHeight);
        out.push(probe === 'pixel'
          ? Array.from(g.getImageData(4, 4, 1, 1).data.slice(0, 3))
          : frameNumber(g, v.videoWidth, v.videoHeight));
      }
      return { out, engine: r.engine, parallelFrames: r.parallelFrames };
    };
    /** the frame the live board shows for the clip, read from its <image> */
    window.__liveFrame = async (id) => {
      const href = document.querySelector(`[data-id="${id}"] image`)?.getAttribute('href');
      if (!href || !href.startsWith('blob:')) return null;
      const img = new Image();
      img.src = href;
      await img.decode();
      return frameNumber(canvasOf(img, img.naturalWidth, img.naturalHeight), img.naturalWidth, img.naturalHeight);
    };
  });
}

/** Make the clip fill the video frame exactly, so its blocks can be read from any rendering. */
async function fillFrame(page) {
  return page.evaluate(() => {
    const d = window.DrawFlow;
    const el = d.elements.find((e) => e.video);
    d.store.getState().updateElement(el.id, { x: 0, y: 0, scale: 1920 / 320, camera: 'custom', customCamera: { cx: 960, cy: 540, zoom: 1 } });
    return d.elements.find((e) => e.id === el.id);
  });
}

const mid = (k) => (k + 0.5) / 30;

test.describe('video clips', () => {
  test('uploaded in the Library, a clip plays frame for frame in the snapshot, the export and the live board', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('tab', { name: 'Uploads', exact: true }).or(page.getByRole('button', { name: 'Uploads', exact: true })).first().click();
    await page.locator('input[type="file"][accept*="video"]').setInputFiles(fileURLToPath(MP4));
    await page.waitForFunction(() => window.DrawFlow.elements.some((e) => e.video));

    const el = await fillFrame(page);
    expect(el.video.duration).toBeCloseTo(3, 1);
    expect(el.video.src.startsWith('data:video/mp4')).toBe(true);
    expect(el.image.src.startsWith('data:image/jpeg')).toBe(true);
    expect([el.style, el.drawDuration]).toEqual(['pop', 0.6]);
    expect(el.pauseAfter).toBeCloseTo(2.4, 1); // the board waits for it to play through
    // it is kept in the uploads, with its first frame as the thumbnail
    await expect(page.locator('button[title^="Add \\"numbered\\""] img')).toHaveAttribute('src', /^data:image\/jpeg/);

    // the SVG renderer (snapshot): frame k shows k/30 s after the clip appeared
    const start = el.startTime;
    for (const k of [21, 37, 63, 88]) expect(await page.evaluate((t) => window.__pngFrame(t), start + mid(k))).toBe(k);
    // after its end it holds the last frame
    expect(await page.evaluate((t) => window.__pngFrame(t), start + 3.6)).toBe(89);

    // the fast export: every output frame i shows clip frame i (frames start on a frame boundary)
    const ks = [20, 21, 22, 23, 50, 51, 80, 88];
    const mp4 = await page.evaluate((ts) => window.__mp4(ts), ks.map((k) => start + mid(k)));
    expect(mp4.parallelFrames).toBeGreaterThan(0);
    expect(mp4.out).toEqual(ks);

    // the live board in camera view, paused on a moment
    await page.getByText('Camera view', { exact: true }).click();
    await page.evaluate((t) => window.DrawFlow.store.getState().setTime(t), start + mid(45));
    await expect.poll(() => page.evaluate((id) => window.__liveFrame(id), el.id), { timeout: 15000 }).toBe(45);
    await page.evaluate((t) => window.DrawFlow.store.getState().setTime(t), start + mid(70));
    await expect.poll(() => page.evaluate((id) => window.__liveFrame(id), el.id), { timeout: 15000 }).toBe(70);
  });

  test('start, loop and a WebM clip; the inspector controls them', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await page.evaluate(async (base64) => {
      await window.DrawFlow.addScene({ name: 'Clip', items: [{ type: 'video', base64, mime: 'video/webm', name: 'clip' }] });
    }, b64(WEBM));
    const el = await fillFrame(page);
    expect(el.video.src.startsWith('data:video/webm')).toBe(true);

    // pick it and use the Video section of the inspector
    await page.evaluate((id) => window.DrawFlow.store.getState().select(id), el.id);
    await expect(page.getByText('Video', { exact: true })).toBeVisible();
    await page.getByText(/^Loop/).click();
    let now = await page.evaluate((id) => window.DrawFlow.elements.find((e) => e.id === id).video, el.id);
    expect(now.loop).toBe(true);
    // looping: 3.5 s after it appeared it is half a second into its second time round
    expect(await page.evaluate((t) => window.__pngFrame(t), el.startTime + 3 + mid(15))).toBe(15);

    // starting 1 s in: it opens on frame 30
    await page.evaluate((id) => {
      const s = window.DrawFlow.store.getState();
      const e = window.DrawFlow.elements.find((x) => x.id === id);
      s.updateElement(id, { video: { ...e.video, loop: false, start: 1 } });
    }, el.id);
    expect(await page.evaluate((t) => window.__pngFrame(t), el.startTime + mid(21))).toBe(51);
    // the board now waits longer than the 2 s that are left: one click fits it
    await page.getByRole('button', { name: /Wait for the clip to finish/ }).click();
    now = await page.evaluate((id) => window.DrawFlow.elements.find((e) => e.id === id), el.id);
    expect(now.drawDuration + now.pauseAfter).toBeCloseTo(2, 1);
  });

  test("a clip's sound goes on the timeline; the project file keeps the clip", async ({ page }) => {
    await openApp(page);
    await page.evaluate(async (base64) => {
      await window.DrawFlow.addScene({ name: 'Clip', items: [{ type: 'video', base64, mime: 'video/mp4', name: 'clip' }] });
    }, b64(MP4));
    const id = await page.evaluate(() => window.DrawFlow.elements.find((e) => e.video).id);
    await page.evaluate((i) => window.DrawFlow.store.getState().select(i), id);
    await page.getByRole('button', { name: 'Add its sound to the timeline' }).click();
    await page.waitForFunction(() => window.DrawFlow.store.getState().audioClips.length === 1);
    const clip = await page.evaluate(() => window.DrawFlow.store.getState().audioClips[0]);
    expect(clip.lane).toBe('sfx');
    expect(clip.duration).toBeCloseTo(3, 0);

    // through a saved file and back
    const json = await page.evaluate(() => window.DrawFlow.saveProject());
    const back = await page.evaluate(async (j) => {
      const r = await window.DrawFlow.loadProject(j);
      return { problems: r.problems, video: window.DrawFlow.elements.find((e) => e.video)?.video };
    }, json);
    expect(back.problems).toEqual([]);
    expect(back.video.duration).toBeCloseTo(3, 1);
    // a broken clip is kept as a still picture, and said so
    const broken = await page.evaluate(async (j) => {
      const doc = JSON.parse(j);
      doc.elements.find((e) => e.video).video.src = 'not a video';
      const r = await window.DrawFlow.loadProject(JSON.stringify(doc));
      return { problems: r.problems, video: window.DrawFlow.elements.find((e) => e.image)?.video ?? null };
    }, json);
    expect(broken.video).toBeNull();
    expect(broken.problems.join(' ')).toMatch(/still picture/);
  });

  test('an unplayable file is refused with a clear reason', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('tab', { name: 'Uploads', exact: true }).or(page.getByRole('button', { name: 'Uploads', exact: true })).first().click();
    await page.locator('input[type="file"][accept*="video"]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video') });
    await expect(page.getByText(/can't be played here/)).toBeVisible();
    expect(await page.evaluate(() => window.DrawFlow.elements.length)).toBe(0);
  });
});

test.describe('backgrounds', () => {
  /** a solid colour picture */
  const solid = (page, color) => page.evaluate((c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 36;
    const g = canvas.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 64, 36);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  const near = (got, want, tol = 18) => got.every((v, i) => Math.abs(v - want[i]) <= tol);

  test('each scene has its own colour or picture; the whole video can have one too', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await page.evaluate(async () => {
      const d = window.DrawFlow;
      await d.addScene({ name: 'One', items: [{ type: 'text', text: 'one' }] });
      await d.addScene({ name: 'Two', items: [{ type: 'text', text: 'two' }] });
      await d.addScene({ name: 'Three', items: [{ type: 'text', text: 'three' }] });
    });
    const red = await solid(page, '#e01e1e');
    const blue = await solid(page, '#1e1ee0');
    await page.evaluate(async ([r, b]) => {
      const d = window.DrawFlow;
      await d.setBackground({ image: { base64: b, mime: 'image/png' } });            // the whole video: blue
      await d.setBackground({ scene: 'One', image: { base64: r, mime: 'image/png' } }); // scene one: red
      await d.setBackground({ scene: 'Three', color: '#22aa44', image: null });       // scene three: green paper…
    }, [red, blue]);
    // …but with no picture of its own, the whole video's picture still shows there
    const times = await page.evaluate(() => window.DrawFlow.describe().scenes.map((s) => s.start + 0.3));
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[0]), [224, 30, 30])).toBe(true);
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[1]), [30, 30, 224])).toBe(true);
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[2]), [30, 30, 224])).toBe(true);

    // without the whole-video picture, scene three shows its own colour; a half-strength picture lets the paper through
    await page.evaluate(async () => {
      await window.DrawFlow.setBackground({ image: null });
      await window.DrawFlow.setBackground({ scene: 'One', opacity: 0.5 });
    });
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[1]), [255, 255, 255])).toBe(true);
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[2]), [34, 170, 68])).toBe(true);
    expect(near(await page.evaluate((t) => window.__pngPixel(t, 0.02, 0.02), times[0]), [240, 142, 142], 22)).toBe(true);

    // the fast export draws the same backgrounds
    const mp4 = await page.evaluate((ts) => window.__mp4(ts, 'pixel'), times);
    expect(mp4.parallelFrames).toBeGreaterThan(0);
    expect(near(mp4.out[0], [240, 142, 142], 26)).toBe(true);
    expect(near(mp4.out[1], [255, 255, 255], 12)).toBe(true);
    expect(near(mp4.out[2], [34, 170, 68], 26)).toBe(true);

    // kept in the project file
    const back = await page.evaluate(async () => {
      const r = await window.DrawFlow.loadProject(await window.DrawFlow.saveProject());
      return { problems: r.problems, scenes: window.DrawFlow.project.scenes.map((s) => [s.name, !!s.backgroundImage, s.background ?? null]) };
    });
    expect(back.problems).toEqual([]);
    expect(back.scenes).toEqual([['One', true, null], ['Two', false, null], ['Three', false, '#22aa44']]);
  });

  test('scene settings and the paper panel choose the picture', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await window.DrawFlow.addScene({ name: 'Garden', items: [{ type: 'text', text: 'hello' }] });
    });
    const red = await solid(page, '#e01e1e');
    // Scene settings, from the scene's right-click menu
    await page.locator('[data-tour="filmstrip"]').getByText('Garden', { exact: true }).first().click({ button: 'right' });
    await page.getByText(/^Scene settings/).click();
    await expect(page.getByText('Paper colour for this scene')).toBeVisible();
    await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') });
    await expect(page.getByRole('button', { name: 'Remove picture' })).toBeVisible();
    await page.getByRole('tab', { name: 'Whole picture' }).or(page.getByRole('button', { name: 'Whole picture' })).first().click();
    const bg = await page.evaluate(() => window.DrawFlow.project.scenes[0].backgroundImage);
    expect(bg.src.startsWith('data:image/png')).toBe(true);
    expect(bg.fit).toBe('contain');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
    // camera view shows it behind the drawing
    await page.getByText('Camera view', { exact: true }).click();
    await expect(page.locator('svg image[clip-path="url(#stage-bg-clip)"]')).toHaveAttribute('href', /^data:image\/png/);

    // the Paper panel sets one for the whole video
    await page.getByText('Edit view', { exact: true }).click();
    await page.getByRole('button', { name: 'Paper', exact: true }).click();
    await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') });
    await expect.poll(() => page.evaluate(() => !!window.DrawFlow.project.backgroundImage)).toBe(true);
  });
});
