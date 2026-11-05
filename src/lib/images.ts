// Raster image intake: decode, downscale large pictures, and produce a
// data: URL (embedded so the export serializer can rasterize it).

import { gifFrameCount } from './gif';

const MAX_SIDE = 1600;

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode this image.'));
    img.src = src;
  });
}

async function isGifFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return String.fromCharCode(...head) === 'GIF';
}

export async function loadRasterImage(file: Blob, mime = file.type): Promise<LoadedImage> {
  const gif = await isGifFile(file);
  // a file with no type would otherwise lose the mark that says it is a GIF
  const raw = await readAsDataUrl(gif ? new Blob([file], { type: 'image/gif' }) : file);
  const img = await loadImageEl(raw);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) throw new Error('Could not decode this image.');

  // shrinking would re-encode it as a still: an animated GIF keeps its own bytes
  if (gif && (await gifFrameCount(raw)) > 1) return { src: raw, width: w, height: h };

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (scale === 1 && file.size < 2_500_000) return { src: raw, width: w, height: h };

  // downscale (and re-encode) so a phone photo doesn't bloat the project
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src: raw, width: w, height: h };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const keepAlpha = mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif';
  const src = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
  return { src, width: canvas.width, height: canvas.height };
}

export function isRasterFile(file: File): boolean {
  return /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.type) ||
    /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
}

export function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}
