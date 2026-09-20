// Asset packs: a zip of SVG / PNG / JPG / WebP / GIF files with an optional
// manifest.json ({ name, items: [{ file, name, tags }] }). Importing fills
// the uploads gallery; exporting turns the gallery into a shareable pack.
// PDF pages are imported as pictures via pdf.js.

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type { GalleryItem } from './gallery';
import { loadRasterImage } from './images';
import { normalizeSvg } from './svgImport';

interface Manifest {
  name?: string;
  items?: { file: string; name?: string; tags?: string[] }[];
}

const RASTER = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' };

/** Read every picture in a pack. Folder names become tags. */
export async function importAssetPack(file: File, onProgress?: (done: number, total: number) => void): Promise<GalleryItem[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  let manifest: Manifest = {};
  const manifestName = Object.keys(files).find((n) => /(^|\/)manifest\.json$/i.test(n));
  if (manifestName) {
    try { manifest = JSON.parse(strFromU8(files[manifestName])) as Manifest; } catch { /* ignore a broken manifest */ }
  }
  const meta = new Map((manifest.items ?? []).map((it) => [it.file.replace(/^\.?\//, ''), it]));
  const names = Object.keys(files).filter((n) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(n) && (RASTER.test(n) || /\.svg$/i.test(n)));
  const out: GalleryItem[] = [];
  let done = 0;
  for (const name of names) {
    const bytes = files[name];
    const base = name.split('/').pop()!.replace(/\.[^.]+$/, '');
    const folders = name.split('/').slice(0, -1).filter((f) => f && f !== '.');
    const m = meta.get(name);
    const tags = Array.from(new Set([...(m?.tags ?? []), ...folders.map((f) => f.toLowerCase())]));
    try {
      if (/\.svg$/i.test(name)) {
        const text = strFromU8(bytes);
        const art = normalizeSvg(text);
        out.push({ id: crypto.randomUUID(), name: m?.name ?? base, kind: 'svg', data: text, width: art.width, height: art.height, addedAt: Date.now(), tags });
      } else {
        const ext = name.split('.').pop()!.toLowerCase();
        const img = await loadRasterImage(new Blob([bytes as BlobPart], { type: MIME[ext] ?? 'image/png' }), MIME[ext] ?? 'image/png');
        out.push({ id: crypto.randomUUID(), name: m?.name ?? base, kind: 'image', data: img.src, width: img.width, height: img.height, addedAt: Date.now(), tags });
      }
    } catch { /* skip files that don't decode */ }
    done++;
    onProgress?.(done, names.length);
  }
  return out;
}

/** Zip the gallery (or a subset) with a manifest. */
export async function exportAssetPack(items: GalleryItem[], packName = 'drawflow-pack'): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: Manifest = { name: packName, items: [] };
  const used = new Set<string>();
  for (const it of items) {
    const base = it.name.replace(/[^\w\- ]+/g, '').trim() || 'asset';
    let fileName = `${base}.${it.kind === 'svg' ? 'svg' : (it.data.match(/^data:image\/(\w+)/)?.[1] ?? 'png').replace('jpeg', 'jpg')}`;
    let n = 2;
    while (used.has(fileName)) { fileName = `${base}-${n++}.${fileName.split('.').pop()}`; }
    used.add(fileName);
    if (it.kind === 'svg') files[fileName] = strToU8(it.data);
    else {
      const b64 = it.data.slice(it.data.indexOf(',') + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      files[fileName] = bytes;
    }
    manifest.items!.push({ file: fileName, name: it.name, tags: it.tags ?? [] });
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

/** Render each page of a PDF to a picture (scaled so the long side is ~1600 px). */
export async function importPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<GalleryItem[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: GalleryItem[] = [];
  const base = file.name.replace(/\.pdf$/i, '');
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const v1 = page.getViewport({ scale: 1 });
    const scale = 1600 / Math.max(v1.width, v1.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      id: crypto.randomUUID(), name: doc.numPages > 1 ? `${base} p${p}` : base, kind: 'image',
      data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, addedAt: Date.now(), tags: ['pdf'],
    });
    onProgress?.(p, doc.numPages);
  }
  return out;
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isZipFile(file: File): boolean {
  return /zip/.test(file.type) || /\.zip$/i.test(file.name);
}
