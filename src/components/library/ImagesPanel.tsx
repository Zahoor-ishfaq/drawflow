import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Package, Pencil, Search, Star, Trash2, Upload } from 'lucide-react';
import { useGallery, type GalleryItem } from '../../lib/gallery';
import { addGalleryItem, addLibraryIllustration } from '../../lib/addElements';
import { loadRasterImage, isRasterFile, isSvgFile } from '../../lib/images';
import { normalizeSvg } from '../../lib/svgImport';
import { exportAssetPack, importAssetPack, importPdf, isPdfFile, isZipFile } from '../../lib/assetPacks';
import { noteUsed, toggleFavorite, useAssetPrefs, forgetAsset } from '../../lib/assetPrefs';
import {
  LIBRARY_CATEGORIES, loadLibraryIndex, searchLibrary, type LibraryEntry,
} from '../../assets/illustrations';
import { IconButton } from '../ui/IconButton';
import { usePlugins } from '../../lib/plugins';
import { addImportedSvg, addImageElement } from '../../lib/addElements';
import { loadRasterImage as loadRaster } from '../../lib/images';

function svgThumb(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

const FAVES = '★ Favourites';
const RECENT = 'Recent';

function StarButton({ id, className = '' }: { id: string; className?: string }) {
  const prefs = useAssetPrefs();
  const on = prefs.favorites.includes(id);
  return (
    <button
      type="button"
      className={
        'absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow ' +
        (on ? 'text-[#f59e0b] opacity-100' : 'text-t3 opacity-0 group-hover:opacity-100 hover:text-[#f59e0b]') + ' ' + className
      }
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }}
    >
      <Star size={11} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Rename an upload and edit its tags. */
function ItemEditor({ item, onSave, onClose }: { item: GalleryItem; onSave: (patch: Partial<GalleryItem>) => void; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [tags, setTags] = useState((item.tags ?? []).join(', '));
  return (
    <div className="col-span-3 flex flex-col gap-1.5 rounded-xl border border-line bg-panel2 p-2">
      <input className="df-input !h-7 text-[12px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
      <input className="df-input !h-7 text-[12px]" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" />
      <div className="flex justify-end gap-1">
        <button type="button" className="h-6 rounded-full px-2.5 text-[11.5px] text-t2 hover:bg-hov" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="h-6 rounded-full bg-accent px-2.5 text-[11.5px] font-medium text-white"
          onClick={() => { onSave({ name: name.trim() || item.name, tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) }); onClose(); }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function ImagesPanel({ onAdded }: { onAdded?: () => void }) {
  const gallery = useGallery();
  const prefs = useAssetPrefs();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const packRef = useRef<HTMLInputElement>(null);

  const [index, setIndex] = useState<LibraryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const { assetProviders } = usePlugins();
  type PluginHit = { providerId: string; id: string; name: string; svg?: string; imageUrl?: string; width?: number; height?: number };
  const [pluginHits, setPluginHits] = useState<PluginHit[]>([]);

  // ask plugin asset providers (debounced) whenever the search changes
  useEffect(() => {
    const q = query.trim();
    if (!q || assetProviders.length === 0) { setPluginHits([]); return; }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const all: PluginHit[] = [];
      for (const p of assetProviders) {
        try {
          const res = await p.search(q);
          for (const r of res.slice(0, 24)) all.push({ providerId: p.id, ...r });
        } catch { /* a broken provider shouldn't break search */ }
      }
      if (!cancelled) setPluginHits(all);
    }, 300);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [query, assetProviders]);

  const usePluginHit = async (h: PluginHit) => {
    setError(null);
    try {
      if (h.svg) addImportedSvg(h.svg, h.name);
      else if (h.imageUrl) {
        const blob = await (await fetch(h.imageUrl)).blob();
        const img = await loadRaster(blob, blob.type || 'image/png');
        addImageElement(img, h.name);
      }
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this picture.');
    }
  };
  const [category, setCategory] = useState<string>('Sketch people');

  useEffect(() => {
    loadLibraryIndex().then(setIndex).catch(() => setIndex([]));
  }, []);

  const results = useMemo(() => {
    if (!index) return [];
    const q = query.trim();
    if (q) return searchLibrary(index, q, null);
    if (category === FAVES) return prefs.favorites.map((id) => index.find((e) => e.id === id)).filter((e): e is LibraryEntry => !!e);
    if (category === RECENT) return prefs.recent.map((id) => index.find((e) => e.id === id)).filter((e): e is LibraryEntry => !!e);
    return searchLibrary(index, '', category);
  }, [index, query, category, prefs]);
  const shown = results.slice(0, 240);

  // uploads that match the search (name or tags)
  const galleryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gallery.items;
    const words = q.split(/\s+/);
    return gallery.items.filter((it) => {
      const hay = `${it.name} ${(it.tags ?? []).join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [gallery.items, query]);
  const favUploads = category === FAVES && !query.trim() ? gallery.items.filter((it) => prefs.favorites.includes(it.id)) : null;
  const recentUploads = category === RECENT && !query.trim() ? prefs.recent.map((id) => gallery.items.find((it) => it.id === id)).filter((x): x is GalleryItem => !!x) : null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy('Importing…');
    try {
      for (const file of Array.from(files)) {
        if (isZipFile(file)) {
          const items = await importAssetPack(file, (d, t) => setBusy(`Importing pack… ${d}/${t}`));
          for (const it of items) await gallery.add(it);
          if (items.length === 0) throw new Error(`No pictures found in "${file.name}".`);
          continue;
        }
        if (isPdfFile(file)) {
          const items = await importPdf(file, (d, t) => setBusy(`Reading PDF… page ${d}/${t}`));
          for (const it of items) await gallery.add(it);
          if (items.length === 1) await addGalleryItem(items[0]);
          continue;
        }
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
          throw new Error(`"${file.name}" isn't a supported file (PNG, JPG, WebP, GIF, SVG, PDF or a .zip pack).`);
        }
        await gallery.add(item);
        await addGalleryItem(item);
        noteUsed(item.id);
      }
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this file.');
    } finally {
      setBusy(null);
    }
  };

  const useItem = async (item: GalleryItem) => {
    setError(null);
    try {
      await addGalleryItem(item);
      noteUsed(item.id);
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this picture.');
    }
  };

  const useEntry = async (entry: LibraryEntry) => {
    setError(null);
    try {
      await addLibraryIllustration(entry);
      noteUsed(entry.id);
      onAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this illustration.');
    }
  };

  const exportPack = async () => {
    if (gallery.items.length === 0) return;
    setBusy('Packing…');
    try {
      const blob = await exportAssetPack(gallery.items, 'my-drawflow-assets');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drawflow-assets.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(null);
    }
  };

  const uploadsToShow = favUploads ?? recentUploads ?? galleryMatches;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* --- My uploads ------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">My uploads</span>
        <span className="flex items-center gap-1">
          <button type="button" className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] text-t2 hover:bg-hov hover:text-t1" title="Import an asset pack (.zip of pictures, optional manifest.json)" onClick={() => packRef.current?.click()}>
            <Package size={11} /> Import pack
          </button>
          <button type="button" className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] text-t2 hover:bg-hov hover:text-t1 disabled:opacity-40" disabled={gallery.items.length === 0} title="Download every upload as a shareable pack" onClick={() => void exportPack()}>
            <Download size={11} /> Export pack
          </button>
          <input ref={packRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
        </span>
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
        {busy ?? 'Upload pictures (PNG, JPG, SVG, PDF, .zip pack)'}
        <input
          type="file"
          accept="image/*,.svg,.pdf,.zip"
          multiple
          className="hidden"
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>
      {uploadsToShow.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {uploadsToShow.map((item) => (
            editing === item.id ? (
              <ItemEditor key={item.id} item={item} onSave={(p) => void gallery.update(item.id, p)} onClose={() => setEditing(null)} />
            ) : (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  title={`Add "${item.name}"${item.tags?.length ? ` · ${item.tags.join(', ')}` : ''}`}
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
                <StarButton id={item.id} />
                <span className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <IconButton label={`Rename or tag "${item.name}"`} className="!h-6 !w-6 rounded-full bg-white/90 shadow" onClick={() => setEditing(item.id)}>
                    <Pencil size={11} />
                  </IconButton>
                  <IconButton
                    label={`Delete "${item.name}" from uploads`}
                    className="!h-6 !w-6 rounded-full bg-white/90 shadow hover:!bg-red-50 hover:!text-red-500"
                    onClick={() => { forgetAsset(item.id); void gallery.remove(item.id); }}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </span>
                <div className="mt-0.5 truncate text-center text-[10.5px] text-t3">{item.name}</div>
              </div>
            )
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-t3">
          {gallery.items.length === 0
            ? 'Pictures you upload are kept here until you delete them. Drop a PDF to import its pages, or a .zip pack of pictures.'
            : 'No uploads here.'}
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
          className="df-input"
          style={{ paddingLeft: 32 }}
          placeholder={index ? `Search ${index.length.toLocaleString()} illustrations and your uploads…` : 'Loading library…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!query.trim() && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {[FAVES, RECENT, ...LIBRARY_CATEGORIES].map((c) => (
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
            <div key={entry.id} className="group relative">
              <button
                type="button"
                title={entry.name}
                aria-label={`Add ${entry.name}`}
                className="df-ui-anim flex h-14 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent hover:bg-accent-weak"
                onClick={() => void useEntry(entry)}
              >
                <img src={entry.src} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />
              </button>
              <StarButton id={entry.id} className="!h-4 !w-4" />
            </div>
          ))}
        </div>
      )}
      {pluginHits.length > 0 && (
        <>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">From plugins</div>
          <div className="grid grid-cols-4 gap-1.5">
            {pluginHits.map((h) => (
              <button
                key={`${h.providerId}:${h.id}`}
                type="button"
                title={h.name}
                className="df-ui-anim flex h-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent"
                onClick={() => void usePluginHit(h)}
              >
                <img src={h.svg ? svgThumb(h.svg) : h.imageUrl} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />
              </button>
            ))}
          </div>
        </>
      )}
      {index && results.length === 0 && (
        <div className="pt-2 text-center text-[12px] text-t3">
          {query.trim() ? `Nothing matches “${query}”` : category === FAVES ? 'Star pictures to collect them here.' : category === RECENT ? 'Pictures you use will show up here.' : 'Nothing here.'}
        </div>
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
