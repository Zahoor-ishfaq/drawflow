import { useRef, useState } from 'react';
import { Download, Package, Pencil, Star, Trash2, Upload } from 'lucide-react';
import { useGallery, type GalleryItem } from '../../lib/gallery';
import { addGalleryItem } from '../../lib/addElements';
import { loadRasterImage, isRasterFile, isSvgFile } from '../../lib/images';
import { normalizeSvg } from '../../lib/svgImport';
import { exportAssetPack, importAssetPack, importPdf, isPdfFile, isZipFile } from '../../lib/assetPacks';
import { noteUsed, toggleFavorite, useAssetPrefs, forgetAsset } from '../../lib/assetPrefs';
import { IconButton } from '../ui/IconButton';

export function svgThumb(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

export function StarButton({ id, className = '' }: { id: string; className?: string }) {
  const prefs = useAssetPrefs();
  const on = prefs.favorites.includes(id);
  return (
    <button
      type="button"
      className={
        'absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-panel/90 shadow ' +
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

/** One upload tile (also used by search results). */
export function UploadTile({ item, onUse, onEdit }: { item: GalleryItem; onUse: () => void; onEdit?: () => void }) {
  const gallery = useGallery();
  return (
    <div className="group relative">
      <button
        type="button"
        title={`Add "${item.name}"${item.tags?.length ? ` · ${item.tags.join(', ')}` : ''}`}
        className="df-ui-anim flex h-[72px] w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent"
        onClick={onUse}
      >
        <img src={item.kind === 'svg' ? svgThumb(item.data) : item.data} alt={item.name} className="max-h-full max-w-full object-contain p-1.5" draggable={false} />
      </button>
      <StarButton id={item.id} />
      <span className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
        {onEdit && (
          <IconButton label={`Rename or tag "${item.name}"`} className="!h-6 !w-6 rounded-full bg-panel/90 shadow" onClick={onEdit}>
            <Pencil size={11} />
          </IconButton>
        )}
        <IconButton
          label={`Delete "${item.name}" from uploads`}
          className="!h-6 !w-6 rounded-full bg-panel/90 shadow hover:!bg-red-50 hover:!text-red-500"
          onClick={() => { forgetAsset(item.id); void gallery.remove(item.id); }}
        >
          <Trash2 size={12} />
        </IconButton>
      </span>
      <div className="mt-0.5 truncate text-center text-[10.5px] text-t3">{item.name}</div>
    </div>
  );
}

/** My uploads: pictures, PDFs and asset packs the user brought in. */
export function UploadsPanel({ onAdded }: { onAdded?: () => void }) {
  const gallery = useGallery();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const packRef = useRef<HTMLInputElement>(null);

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
          item = { id: crypto.randomUUID(), name: file.name.replace(/\.svg$/i, ''), kind: 'svg', data: text, width: art.width, height: art.height, addedAt: Date.now() };
        } else if (isRasterFile(file)) {
          const img = await loadRasterImage(file);
          item = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), kind: 'image', data: img.src, width: img.width, height: img.height, addedAt: Date.now() };
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

  return (
    <div className="flex flex-col gap-3">
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
        <input type="file" accept="image/*,.svg,.pdf,.zip" multiple className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
      </label>
      <div className="flex items-center gap-1">
        <button type="button" className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] text-t2 hover:bg-hov hover:text-t1" title="Import an asset pack (.zip of pictures, optional manifest.json)" onClick={() => packRef.current?.click()}>
          <Package size={11} /> Import pack
        </button>
        <button type="button" className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] text-t2 hover:bg-hov hover:text-t1 disabled:opacity-40" disabled={gallery.items.length === 0} title="Download every upload as a shareable pack" onClick={() => void exportPack()}>
          <Download size={11} /> Export pack
        </button>
        <span className="flex-1" />
        <span className="text-[11px] text-t3">{gallery.items.length ? `${gallery.items.length} saved` : ''}</span>
        <input ref={packRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <div className="text-[12px] text-red-500">{error}</div>}
      {gallery.items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {gallery.items.map((item) => (
            editing === item.id ? (
              <ItemEditor key={item.id} item={item} onSave={(p) => void gallery.update(item.id, p)} onClose={() => setEditing(null)} />
            ) : (
              <UploadTile key={item.id} item={item} onUse={() => void useItem(item)} onEdit={() => setEditing(item.id)} />
            )
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-t3">
          Pictures you upload are kept here until you delete them. Drop a PDF to import its pages, or a .zip pack of pictures.
        </p>
      )}
    </div>
  );
}
