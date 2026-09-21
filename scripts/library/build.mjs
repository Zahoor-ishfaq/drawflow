#!/usr/bin/env node
// Builds the illustration library: downloads the open-licensed packs listed
// in sources.mjs into .cache/library-src, cleans every SVG into the subset
// the app draws (see normalize.mjs), writes them under public/library/<pack>/
// and regenerates public/library/index.json. The OpenMoji black glyphs and
// Open Doodles already in the repo are kept as they are.
//
//   node scripts/library/build.mjs            # everything
//   node scripts/library/build.mjs tabler     # one pack
//
// Needs Chrome or Edge on the machine (Playwright drives it to compute styles
// and bounding boxes) — the same requirement as `npm test`.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { SOURCES } from './sources.mjs';
import { normalizeInPage } from './normalize.mjs';
import { PACKS } from './packs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache', 'library-src');
const OUT = path.join(ROOT, 'public', 'library');
const only = process.argv.slice(2);

async function download(name, src) {
  const dir = path.join(CACHE, name);
  if (fs.existsSync(path.join(dir, '.done'))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(CACHE, `${name}.tgz`);
  if (!fs.existsSync(archive)) {
    process.stdout.write(`  downloading ${src.url}\n`);
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`${src.url}: HTTP ${res.status}`);
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  }
  // relative paths: GNU tar reads "C:\…" as a remote host
  execFileSync('tar', ['-xzf', path.basename(archive), '-C', name], { cwd: CACHE });
  fs.writeFileSync(path.join(dir, '.done'), new Date().toISOString());
  return dir;
}

/** All files under dir matching the predicate (relative paths, forward slashes). */
export function listFiles(dir, pred) {
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (pred(p.replace(/\\/g, '/'))) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.DRAWFLOW_BROWSER || 'msedge', headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const normalize = (svg, opts) => page.evaluate(normalizeInPage, { svg, opts });

  const indexPath = path.join(OUT, 'index.json');
  const existing = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
  const keep = existing.filter((e) => !PACKS.some((p) => (only.length === 0 || only.includes(p.id)) && e.src.startsWith(`/library/${p.dir}/`)));
  let entries = keep;

  for (const pack of PACKS) {
    if (only.length && !only.includes(pack.id)) continue;
    process.stdout.write(`\n${pack.id}: ${SOURCES[pack.source].title}\n`);
    const srcDir = await download(pack.source, SOURCES[pack.source]);
    const outDir = path.join(OUT, pack.dir);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const t0 = Date.now();
    const made = await pack.build({ srcDir, outDir, normalize, listFiles, page, existing: entries });
    // drop any entry whose file was not written (normalisation found nothing drawable)
    const good = made.filter((e) => fs.existsSync(path.join(OUT, e.src.replace('/library/', ''))));
    process.stdout.write(`  ${good.length} pictures (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    entries = entries.filter((e) => !e.src.startsWith(`/library/${pack.dir}/`)).concat(good);
  }

  // stable order: existing first, then packs in the order above
  fs.writeFileSync(indexPath, JSON.stringify(entries));
  process.stdout.write(`\nindex.json: ${entries.length} entries\n`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
