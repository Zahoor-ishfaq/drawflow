import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2, Upload } from 'lucide-react';
import { useGallery, type GalleryItem } from '../../lib/gallery';
import { addGalleryItem, addLibraryIllustration } from '../../lib/addElements';
import { loadRasterImage, isRasterFile, isSvgFile } from '../../lib/images';
import { normalizeSvg } from '../../lib/svgImport';
import {
  LIBRARY_CATEGORIES, loadLibraryIndex, searchLibrary, type LibraryEntry,
} from '../../assets/illustrations';
import { IconButton } from '../ui/IconButton';

function svgThumb(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

export function ImagesPanel({ onAdded }: { onAdded?: () => void }) {
  const gallery = useGallery();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [index, setIndex] = useState<LibraryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>('Sketch people');

  useEffect(() => {
    loadLibraryIndex().then(setIndex).catch(() => setIndex([]));
  }, []);

  const results = useMemo(
    () => (index ? searchLibrary(index, query, query.trim() ? null : category) : []),
    [index, query, category],
  );
  const shown = results.slice(0, 240);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        let item: GalleryItem;
        if (isSvgFile(file)) {
          const text = await file.text();
          const art = normalizeSvg(text); // validates
          item = {
            id: crypto.randomUUID(), name: file.name.replace(/\.svg$/i, ''), kind: 'svg',
            data: text, width: art.width, height: art.height, addedAt: Date.now(),
          };
        } else if (isRasterFile(file)) {
          const img = await loadRasterImage(file);
          item = {
            id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), kind: 'image',
            data: img.src, width: img.width, height: img.height, addedAt: Date.now(),
          };
        } else {
          throw new Error(`"${file.name}" isn't a supported picture (PNG, JPG, WebP, GIF or SVG).`);
        }
        await gallery.add(item);
        await addGalleryItem(item);
      }
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this file.');
    } finally {
      setBusy(false);
    }
  };

  const useItem = async (item: GalleryItem) => {
    setError(null);
    try {
      await addGalleryItem(item);
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this picture.');
    }
  };

  const useEntry = async (entry: LibraryEntry) => {
    setError(null);
    try {
      await addLibraryIllustration(entry);
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this illustration.');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* --- My uploads ------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">My uploads</span>
        <span className="text-[11px] text-t3">{gallery.items.length ? `${gallery.items.length} saved` : ''}</span>
      </div>
      <label
        className={
          'flex h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-[12.5px] ' +
          (dragOver ? 'border-accent bg-accent-weak text-accent' : 'border-line text-t3 hover:border-accent hover:text-accent')
        }
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
      >
        <Upload size={16} />
        {busy ? 'Importing…' : 'Upload pictures (PNG, JPG, SVG…)'}
        <input
          type="file"
          accept="image/*,.svg"
          multiple
          className="hidden"
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>
      {gallery.items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {gallery.items.map((item) => (
            <div key={item.id} className="group relative">
              <button
                type="button"
                title={`Add "${item.name}"`}
                className="df-ui-anim flex h-[72px] w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent"
                onClick={() => void useItem(item)}
              >
                <img
                  src={item.kind === 'svg' ? svgThumb(item.data) : item.data}
                  alt={item.name}
                  className="max-h-full max-w-full object-contain p-1.5"
                  draggable={false}
                />
              </button>
              <IconButton
                label={`Delete "${item.name}" from uploads`}
                className="absolute top-1 right-1 !h-6 !w-6 rounded-full bg-white/90 opacity-0 shadow group-hover:opacity-100 hover:!bg-red-50 hover:!text-red-500"
                onClick={() => void gallery.remove(item.id)}
              >
                <Trash2 size={12} />
              </IconButton>
              <div className="mt-0.5 truncate text-center text-[10.5px] text-t3">{item.name}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-t3">
          Pictures you upload are kept here until you delete them.
        </p>
      )}
      {error && <div className="text-[12px] text-red-500">{error}</div>}

      {/* --- Library --------------------------------------------------- */}
      <div className="mt-2 border-t border-line pt-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Library</span>
      </div>
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-t3" />
        <input
          type="search"
          className="df-input pl-8"
          placeholder={index ? `Search ${index.length.toLocaleString()} illustrations…` : 'Loading library…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!query.trim() && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {LIBRARY_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={
                'df-ui-anim h-6.5 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors ' +
                (category === c ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-t2 hover:text-t1')
              }
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {index && (
        <div className="grid grid-cols-4 gap-1.5">
          {shown.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.name}
              aria-label={`Add ${entry.name}`}
              className="df-ui-anim flex h-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent hover:bg-accent-weak"
              onClick={() => void useEntry(entry)}
            >
              <img src={entry.src} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />
            </button>
          ))}
        </div>
      )}
      {index && results.length === 0 && (
        <div className="pt-2 text-center text-[12px] text-t3">Nothing matches “{query}”</div>
      )}
      {index && results.length > shown.length && (
        <div className="text-center text-[11px] text-t3">Showing {shown.length} of {results.length} — refine your search</div>
      )}
      <p className="text-[10.5px] leading-relaxed text-t3">
        Library artwork: OpenMoji (CC BY-SA 4.0) and Open Doodles (CC0).
      </p>
    </div>
  );
}
