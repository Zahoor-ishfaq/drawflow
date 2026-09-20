// Shared helpers for the end-to-end tests.

export async function openApp(page) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => !!window.DrawFlow, null, { timeout: 60_000 });
  await page.evaluate(() => window.DrawFlow.store.getState().newProject());
}

export async function addText(page, text, index) {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByPlaceholder('Type something…').fill(text);
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await page.getByText(`${index}. ${text}`).last().waitFor();
}

/** Snapshot of the elements in play order. */
export function elements(page) {
  return page.evaluate(() =>
    window.DrawFlow.elements.map((e) => ({
      id: e.id, label: e.label, x: Math.round(e.x), y: Math.round(e.y), start: +e.startTime.toFixed(2),
      draw: +e.drawDuration.toFixed(2), style: e.style, locked: !!e.locked, hidden: !!e.hidden, layer: e.layer ?? 0, scene: e.sceneId,
    })),
  );
}

export function project(page) {
  return page.evaluate(() => { const p = window.DrawFlow.project; return { name: p.name, duration: +p.duration.toFixed(2), scenes: (p.scenes ?? []).map((s) => s.name), markers: (p.markers ?? []).length }; });
}

/** Read the downloaded blob of the export dialog's result as a Buffer. */
export async function downloadedBytes(page) {
  const b64 = await page.evaluate(async () => {
    const a = document.querySelector('a[download]');
    const buf = await (await fetch(a.href)).arrayBuffer();
    let str = '';
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) str += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(str);
  });
  return Buffer.from(b64, 'base64');
}
