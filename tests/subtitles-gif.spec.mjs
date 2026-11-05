import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { openApp } from './helpers.mjs';

const { GIFEncoder } = createRequire(import.meta.url)('gifenc');

const FRAME_COLORS = { red: [230, 30, 30], green: [30, 200, 30], blue: [30, 30, 230], yellow: [240, 220, 20] };

/** An animated GIF of solid colours. */
function makeGif(colors, delay, width = 64, height = 64) {
  const gif = GIFEncoder();
  const index = new Uint8Array(width * height);
  for (const c of colors) gif.writeFrame(index, width, height, { palette: [FRAME_COLORS[c], [0, 0, 0]], delay });
  gif.finish();
  return Buffer.from(gif.bytes()).toString('base64');
}

/** A mono WAV of tones and silences: [[seconds, loud?], …]. */
function makeWav(parts, rate = 24000) {
  const samples = parts.reduce((n, [s]) => n + Math.round(s * rate), 0);
  const out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  let at = 0;
  for (const [s, loud] of parts) {
    for (let i = Math.round(s * rate); i > 0; i--, at++) {
      out.writeInt16LE(loud ? Math.round(9000 * Math.sin((at * 2 * Math.PI * 220) / rate)) : 0, 44 + at * 2);
    }
  }
  return out.toString('base64');
}

const nearest = ([r, g, b]) => {
  const dist = (p) => (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
  return Object.keys(FRAME_COLORS).sort((a, b2) => dist(FRAME_COLORS[a]) - dist(FRAME_COLORS[b2]))[0];
};

/** Installs page helpers that read pixels out of PNGs and rendered MP4s. */
async function installReaders(page) {
  await page.evaluate(() => {
    const read = (source, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(source, 0, 0, w, h);
      return g.getImageData(0, 0, w, h);
    };
    const summary = (img) => {
      const { data, width: w, height: h } = img;
      const px = (x, y) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
      /** share of dark pixels in a horizontal band, as fractions of the height */
      const dark = (from, to) => {
        let n = 0, hit = 0;
        for (let y = Math.floor(from * h); y < to * h; y++) {
          for (let x = 0; x < w; x++, n++) if (data[(y * w + x) * 4] < 110) hit++;
        }
        return hit / n;
      };
      return { center: px(w >> 1, h >> 1), top: dark(0.05, 0.2), middle: dark(0.42, 0.58), bottom: dark(0.8, 0.95) };
    };
    window.__png = async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      return summary(read(bmp, bmp.width, bmp.height));
    };
    window.__video = async (times) => {
      const r = await window.DrawFlow.render({ format: 'mp4', height: 360 });
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(r.blob);
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('video would not load')); });
      const out = [];
      for (const t of times) {
        await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; }); await new Promise((ok) => setTimeout(ok, 200)); // the picture arrives just after the seek
        out.push(summary(read(v, v.videoWidth, v.videoHeight)));
      }
      return { frames: out, engine: r.engine, parallelFrames: r.parallelFrames };
    };
  });
}

const preview = (page, time) => page.evaluate(async (t) => {
  const r = await window.DrawFlow.previewBase64({ time: t, height: 360 });
  return window.__png(r.base64);
}, time);

async function gifScene(page, gif) {
  await page.evaluate(async (base64) => {
    const d = window.DrawFlow;
    await d.addScene({ name: 'Clip', items: [{ type: 'image', base64, mime: 'image/gif', name: 'colours' }] });
    const s = d.store.getState();
    s.updateElement(d.elements[0].id, { style: 'appear', drawDuration: 0.1, pauseAfter: 4, camera: 'whole', x: 960, y: 540, scale: 6 });
  }, gif);
  return page.evaluate(() => window.DrawFlow.elements[0].startTime);
}

test.describe('animated GIFs', () => {
  test('play at the same frame in the preview, the snapshot and the video', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    // four colours for 200 ms each: the loop is 0.8 s, so 0.9 s is back on the first
    const start = await gifScene(page, makeGif(['red', 'green', 'blue', 'yellow'], 200));
    expect(await page.evaluate(() => window.DrawFlow.elements[0].image.src.slice(0, 15))).toBe('data:image/gif;');
    const steps = [[0.1, 'red'], [0.3, 'green'], [0.5, 'blue'], [0.7, 'yellow'], [0.9, 'red'], [2.1, 'blue']];

    for (const [t, want] of steps) expect(nearest((await preview(page, start + t)).center)).toBe(want);

    const video = await page.evaluate((times) => window.__video(times), steps.map(([t]) => start + t + 0.01));
    expect(video.parallelFrames).toBeGreaterThan(0); // the fast renderer, not its fallback
    expect(video.frames.map((f) => nearest(f.center))).toEqual(steps.map(([, want]) => want));

    await page.evaluate(() => window.DrawFlow.store.setState({ cameraView: true }));
    const live = page.locator('[data-id]').first();
    await live.waitFor();
    for (const [t, want] of steps) {
      await page.evaluate((x) => window.DrawFlow.store.getState().setTime(x), start + t);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
      const shot = (await live.screenshot()).toString('base64');
      expect(nearest((await page.evaluate((b) => window.__png(b), shot)).center)).toBe(want);
    }
  });

  test('never flash blank while playing, and survive save and load', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await gifScene(page, makeGif(['red', 'green', 'blue', 'yellow'], 100));
    await page.evaluate(() => {
      const s = window.DrawFlow.store.getState();
      s.setTime(0);
      window.DrawFlow.store.setState({ cameraView: true });
    });
    const live = page.locator('[data-id]').first();
    await live.waitFor();
    await page.evaluate(() => window.DrawFlow.store.getState().play());
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const shot = (await live.screenshot({ timeout: 5000 })).toString('base64');
      seen.push((await page.evaluate((b) => window.__png(b), shot)).center);
    }
    await page.evaluate(() => window.DrawFlow.store.getState().pause());
    for (const [r, g, b] of seen) expect(r > 200 && g > 200 && b > 200).toBe(false); // white would be the bare paper
    expect(new Set(seen.map(nearest)).size).toBeGreaterThan(1);

    const json = await page.evaluate(() => window.DrawFlow.saveProject());
    await page.evaluate(() => window.DrawFlow.store.setState({ cameraView: false }));
    await page.evaluate((j) => window.DrawFlow.loadProject(j), json);
    const start = await page.evaluate(() => window.DrawFlow.elements[0].startTime);
    expect(nearest((await preview(page, start + 0.25)).center)).toBe('blue');
  });

  test('uploaded through the Library like any picture, one still moves', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('tab', { name: 'Uploads' }).click();
    await page.locator('input[type=file][accept*="image"]').first().setInputFiles({
      name: 'colours.gif', mimeType: 'image/gif', buffer: Buffer.from(makeGif(['red', 'green'], 200), 'base64'),
    });
    await page.waitForFunction(() => window.DrawFlow.elements.length === 1);
    expect(await page.evaluate(() => window.DrawFlow.elements[0].image.src.slice(0, 15))).toBe('data:image/gif;');
    // it pops in, so it can be watched rather than scribbled over
    expect(await page.evaluate(() => { const e = window.DrawFlow.elements[0]; return [e.style, e.drawDuration]; })).toEqual(['pop', 0.6]);
    await page.evaluate(() => {
      const d = window.DrawFlow;
      d.store.getState().updateElement(d.elements[0].id, { style: 'appear', drawDuration: 0.1, pauseAfter: 3, camera: 'whole', x: 960, y: 540, scale: 6 });
    });
    const start = await page.evaluate(() => window.DrawFlow.elements[0].startTime);
    expect(nearest((await preview(page, start + 0.1)).center)).toBe('red');
    expect(nearest((await preview(page, start + 0.3)).center)).toBe('green');
  });

  test('a big animated GIF keeps moving; a still one is just a picture', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    const big = makeGif(['red', 'green'], 200, 1800, 40); // wider than pictures are allowed to stay
    const start = await gifScene(page, big);
    expect(await page.evaluate(() => window.DrawFlow.elements[0].image.src.slice(0, 15))).toBe('data:image/gif;');
    await page.evaluate(() => {
      const d = window.DrawFlow;
      d.store.getState().updateElement(d.elements[0].id, { scale: 1, x: 960, y: 540 });
    });
    expect(nearest((await preview(page, start + 0.1)).center)).toBe('red');
    expect(nearest((await preview(page, start + 0.3)).center)).toBe('green');

    await page.evaluate(() => window.DrawFlow.store.getState().newProject());
    const s = await gifScene(page, makeGif(['blue'], 100));
    expect(nearest((await preview(page, s + 0.5)).center)).toBe('blue');
  });
});

test.describe('subtitles', () => {
  const SRT = '1\r\n00:00:00,300 --> 00:00:02,000\r\n<i>你好，世界</i>\r\n\r\n2\r\n00:00:02,500 --> 00:00:04,000\r\nSecond line\r\n';

  async function textScene(page) {
    await page.evaluate(async () => {
      const d = window.DrawFlow;
      await d.addScene({ name: 'One', items: [{ type: 'text', text: 'Hi', size: 'small' }], holdDuration: 12 });
    });
  }

  test('an .srt shows in the snapshot and the video, where and when it says', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await textScene(page);
    // late enough that the board has stopped changing
    const srt = '1\n00:00:06,000 --> 00:00:08,000\n你好，世界\n\n2\n00:00:08,500 --> 00:00:10,000\nSecond line\n';
    expect(await page.evaluate((s) => window.DrawFlow.importSubtitles(s), SRT)).toBe(2);
    expect(await page.evaluate(() => window.DrawFlow.describe().subtitles)).toMatchObject({ show: true, lines: 2, font: 'Arial', position: 'bottom' });
    expect(await page.evaluate(() => window.DrawFlow.subtitlesSrt())).toBe(
      '1\n00:00:00,300 --> 00:00:02,000\n你好，世界\n\n2\n00:00:02,500 --> 00:00:04,000\nSecond line\n',
    );
    await page.evaluate((s) => window.DrawFlow.importSubtitles(s), srt);

    const look = (o) => page.evaluate((x) => window.DrawFlow.setSubtitles(x), o);
    await look({ show: false });
    const board = await preview(page, 7);
    await look({ show: true });

    const on = await preview(page, 7);
    expect(on.bottom).toBeGreaterThan(board.bottom + 0.03);
    expect(Math.abs((await preview(page, 8.2)).bottom - board.bottom)).toBeLessThan(0.005); // nothing between lines

    await look({ position: 'top' });
    const top = await preview(page, 7);
    expect(top.top).toBeGreaterThan(board.top + 0.03);
    expect(Math.abs(top.bottom - board.bottom)).toBeLessThan(0.005);

    await look({ position: 'middle', size: 90 });
    expect((await preview(page, 7)).middle).toBeGreaterThan(board.middle + 0.03);

    await look({ position: 'bottom', size: 44 });
    const video = await page.evaluate(() => window.__video([7, 8.2, 9]));
    expect(video.parallelFrames).toBeGreaterThan(0);
    expect(video.frames[0].bottom).toBeGreaterThan(video.frames[1].bottom + 0.03);
    expect(video.frames[2].bottom).toBeGreaterThan(video.frames[1].bottom + 0.03);
    expect(Math.abs(video.frames[0].bottom - on.bottom)).toBeLessThan(0.01); // the two renderers agree

    await look({ show: false });
    expect(Math.abs((await preview(page, 7)).bottom - board.bottom)).toBeLessThan(0.005);
    await expect(look({ position: 'left' })).rejects.toThrow(/top, middle or bottom/);
  });

  test('a new project does not inherit the last one', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const d = window.DrawFlow;
      d.setSubtitles({ show: true, position: 'top', size: 90 });
      d.store.getState().updateProject({ exportHeight: 720, handSmoothing: 0.5 });
      d.newProject({ name: 'Fresh' });
    });
    const p = await page.evaluate(() => window.DrawFlow.project);
    expect(p.name).toBe('Fresh');
    expect(p.subtitles).toBeUndefined();
    expect(p.exportHeight).toBeUndefined();
    expect(p.handSmoothing).toBeUndefined();
  });

  test('come from the voice clip, follow it, and keep their timing', async ({ page }) => {
    await openApp(page);
    await installReaders(page);
    await textScene(page);
    // one second of speech, a long pause, one second of speech
    const audio = { base64: makeWav([[1, true], [0.7, false], [1, true]]), mime: 'audio/wav', name: 'take' };
    await page.evaluate((a) => window.DrawFlow.addVoiceover({ scene: '1', audio: a, text: 'First sentence here. Second sentence follows.', fit: false }), audio);
    const clip = await page.evaluate(() => window.DrawFlow.store.getState().audioClips[0]);
    expect(clip.transcript).toBe('First sentence here. Second sentence follows.');
    expect(clip.cues.map((c) => c.text)).toEqual(['First sentence here.', 'Second sentence follows.']);
    expect(clip.cues[0].start).toBeLessThan(0.1);
    expect(clip.cues[0].end).toBeGreaterThan(0.9);
    expect(clip.cues[0].end).toBeLessThan(1.4);
    expect(Math.abs(clip.cues[1].start - 1.7)).toBeLessThan(0.1); // starts on the voice, not in the pause
    expect(await page.evaluate(() => window.DrawFlow.describe().subtitles.lines)).toBe(2);

    const seconds = (srt) => [...srt.matchAll(/(\d\d):(\d\d),(\d{3}) -->/g)].map((m) => +m[1] * 60 + +m[2] + +m[3] / 1000);
    const before = seconds(await page.evaluate(() => window.DrawFlow.subtitlesSrt()));
    await page.evaluate((c) => window.DrawFlow.store.getState().updateAudioClip(c.id, { startTime: c.startTime + 2 }), clip);
    const after = seconds(await page.evaluate(() => window.DrawFlow.subtitlesSrt()));
    expect(after[0] - before[0]).toBeCloseTo(2, 2);
    expect(after[1] - before[1]).toBeCloseTo(2, 2);

    // split in the pause: each half keeps its own line
    await page.evaluate((c) => window.DrawFlow.store.getState().splitAudioClip(c.id, c.startTime + 2 + 1.35), clip);
    const parts = await page.evaluate(() => window.DrawFlow.store.getState().audioClips.length);
    expect(parts).toBe(2);
    expect(await page.evaluate(() => window.DrawFlow.describe().subtitles.lines)).toBe(2);

    // an imported file replaces them, and taking it away brings them back
    await page.evaluate((s) => window.DrawFlow.importSubtitles(s), SRT);
    expect(await page.evaluate(() => window.DrawFlow.subtitlesSrt())).toContain('你好，世界');
    await page.evaluate(() => {
      const d = window.DrawFlow;
      d.store.getState().updateProject({ subtitles: { ...d.project.subtitles, cues: undefined } });
    });
    expect(await page.evaluate(() => window.DrawFlow.subtitlesSrt())).toContain('First sentence here.');
  });

  test('a GIF stays in full view while the narration fits around it', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async (base64) => {
      await window.DrawFlow.addScene({ name: 'One', items: [{ type: 'text', text: 'Hi' }, { type: 'image', base64, mime: 'image/gif', name: 'dot' }] });
    }, makeGif(['red', 'green'], 200));
    const audio = { base64: makeWav([[1.5, true], [0.6, false], [2, true]]), mime: 'audio/wav', name: 'two' };
    await page.evaluate((a) => window.DrawFlow.addVoiceover({ scene: '1', audio: a, text: 'First phrase. Second phrase.' }), audio);
    const gif = await page.evaluate(() => { const e = window.DrawFlow.elements[1]; return { draw: e.drawDuration, hold: e.pauseAfter, style: e.style }; });
    expect(gif.style).toBe('pop');
    expect(gif.draw).toBeLessThan(0.7);
    expect(gif.hold).toBeGreaterThan(1); // in full view for the rest of its phrase
  });

  test('uneven narration still fits a scene of three items', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await window.DrawFlow.addScene({ name: 'Three', items: [{ type: 'text', text: 'One' }, { type: 'text', text: 'Two' }, { type: 'text', text: 'Three' }] });
    });
    // four phrases and one of them much longer than the rest: too uneven to share out by length alone
    const audio = { base64: makeWav([[1, true], [0.5, false], [0.4, true], [0.5, false], [4, true], [0.5, false], [0.6, true]]), mime: 'audio/wav', name: 'uneven' };
    await page.evaluate((a) => window.DrawFlow.addVoiceover({ scene: '1', audio: a, text: 'One. Two. Three. Four.' }), audio);
    const items = await page.evaluate(() => window.DrawFlow.elements.map((e) => e.startTime));
    expect(items.length).toBe(3);
    expect(items[1]).toBeGreaterThan(items[0]);
    expect(items[2]).toBeGreaterThan(items[1]);
  });

  test('long Chinese narration is split into short lines without losing a word', async ({ page }) => {
    await openApp(page);
    await textScene(page);
    const sentence = '白板动画视频可以用简单的图画和文字解释复杂的想法，观众更容易记住内容。';
    const text = sentence.repeat(4) + '没有标点的长句子也必须被切开否则字幕会盖住画面而且读起来也很累所以需要在合适的位置换行并保持每一条都足够短才方便观众阅读';
    const audio = { base64: makeWav([[12, true]]), mime: 'audio/wav', name: 'zh' };
    await page.evaluate(([a, t]) => window.DrawFlow.addVoiceover({ scene: '1', audio: a, text: t, fit: false }), [audio, text]);
    const cues = await page.evaluate(() => window.DrawFlow.store.getState().audioClips[0].cues);
    expect(cues.length).toBeGreaterThan(4);
    expect(cues.map((c) => c.text).join('')).toBe(text);
    for (const c of cues) expect([...c.text].length).toBeLessThanOrEqual(42);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end - 0.001);
  });

  test('old GBK files and damaged files are read safely', async ({ page }) => {
    await openApp(page);
    await textScene(page);
    // "你好" in GBK
    const gbk = [...Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n'), 0xc4, 0xe3, 0xba, 0xc3, 10];
    await page.evaluate((b) => window.DrawFlow.importSubtitles(new Uint8Array(b)), gbk);
    expect(await page.evaluate(() => window.DrawFlow.subtitlesSrt())).toContain('你好');
    await expect(page.evaluate(() => window.DrawFlow.importSubtitles('this is not a subtitle file'))).rejects.toThrow(/No subtitles found/);

    const file = JSON.parse(await page.evaluate(() => window.DrawFlow.saveProject()));
    file.project.subtitles = { show: 'yes', size: 9000, position: 'left', cues: [{ start: 1, end: 2, text: 'kept' }, { start: 'x', end: 2, text: 'bad' }, { start: 5, end: 4, text: 'backwards' }] };
    await page.evaluate((j) => window.DrawFlow.loadProject(j), JSON.stringify(file));
    expect(await page.evaluate(() => window.DrawFlow.project.subtitles)).toMatchObject({ show: false, size: 160, position: 'bottom', cues: [{ start: 1, end: 2, text: 'kept' }] });
  });

  test('the Subtitles panel changes the look and the export dialog offers the .srt', async ({ page }) => {
    await openApp(page);
    await textScene(page);
    await page.evaluate((s) => window.DrawFlow.importSubtitles(s), SRT);
    await page.getByRole('button', { name: 'Subtitles', exact: true }).click();
    await expect(page.getByText('2 lines from your .srt file.')).toBeVisible();
    await page.getByRole('tab', { name: 'Top' }).click();
    await page.locator('select').filter({ hasText: 'Microsoft YaHei' }).selectOption('Microsoft YaHei');
    await page.getByLabel('Dark band behind the words').uncheck();
    expect(await page.evaluate(() => window.DrawFlow.project.subtitles)).toMatchObject({ position: 'top', font: 'Microsoft YaHei', box: false });

    await page.getByRole('button', { name: 'Download video' }).click();
    const saved = page.waitForEvent('download');
    await page.locator('div.fixed.inset-0').getByRole('button', { name: 'Save .srt' }).click();
    const file = await saved;
    expect(file.suggestedFilename()).toMatch(/\.srt$/);
  });
});
