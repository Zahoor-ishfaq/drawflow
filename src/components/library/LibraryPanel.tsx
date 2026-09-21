import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, Circle, MessageSquare, Minus, RectangleHorizontal, Search, Square, Star, X,
} from 'lucide-react';
import { useGallery } from '../../lib/gallery';
import { addGalleryItem, addImportedSvg, addImageElement, addLibraryElement, addLibraryIllustration, addShapeElement } from '../../lib/addElements';
import { loadRasterImage } from '../../lib/images';
import { noteUsed, setColorPictures, useAssetPrefs } from '../../lib/assetPrefs';
import { LIBRARY_CATEGORIES, loadLibraryIndex, pictureSrc, searchLibrary, type LibraryEntry } from '../../assets/illustrations';
import { ICONS, ICON_GROUPS } from '../../assets/library';
import { buildIndex, searchAll, type SearchHit } from '../../lib/librarySearch';
import { usePlugins } from '../../lib/plugins';
import { Segmented } from '../ui/Segmented';
import { UploadsPanel, UploadTile, StarButton } from './UploadsPanel';
import { CharactersPanel } from './CharactersPanel';

type Tab = 'pictures' | 'shapes' | 'people' | 'uploads';

const SHAPE_ICONS: { id: string; label: string; Icon: typeof Square }[] = [
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'rounded-rect', label: 'Rounded', Icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'line', label: 'Line', Icon: Minus },
  { id: 'arrow', label: 'Arrow', Icon: ArrowRight },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'check', label: 'Check', Icon: Check },
  { id: 'speech-bubble', label: 'Bubble', Icon: MessageSquare },
];

const FAVES = '★ Favourites';
const RECENT = 'Recent';

function IconGlyph({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Shapes and outline icons. */
function ShapesTab() {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Shapes</span>
      <div className="grid grid-cols-4 gap-2">
        {SHAPE_ICONS.map(({ id, label, Icon }) => (
          <button key={id} type="button" title={`Add ${label.toLowerCase()}`}
            className="df-ui-anim flex h-[60px] flex-col items-center justify-center gap-1 rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
            onClick={() => addShapeElement(id)}>
            <Icon size={18} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-1 border-t border-line pt-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">Icons</span>
      </div>
      {ICON_GROUPS.map((group) => (
        <div key={group}>
          <div className="mb-1.5 text-[11px] text-t3">{group}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {ICONS.filter((a) => a.group === group).map((asset) => (
              <button key={asset.id} type="button" title={asset.name} aria-label={`Add ${asset.name}`}
                className="df-ui-anim flex h-12 items-center justify-center rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
                onClick={() => addLibraryElement(asset)}>
                <IconGlyph paths={asset.paths} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Illustrations by category, favourites and recents. */
function PicturesTab({ index, onAdded }: { index: LibraryEntry[] | null; onAdded?: () => void }) {
  const prefs = useAssetPrefs();
  const gallery = useGallery();
  const [category, setCategory] = useState<string>('Objects');
  const results = useMemo(() => {
    if (!index) return [];
    if (category === FAVES) return prefs.favorites.map((id) => index.find((e) => e.id === id)).filter((e): e is LibraryEntry => !!e);
    if (category === RECENT) return prefs.recent.map((id) => index.find((e) => e.id === id)).filter((e): e is LibraryEntry => !!e);
    return searchLibrary(index, '', category);
  }, [index, category, prefs]);
  const favUploads = category === FAVES ? gallery.items.filter((it) => prefs.favorites.includes(it.id)) : [];
  const recentUploads = category === RECENT ? prefs.recent.map((id) => gallery.items.find((it) => it.id === id)).filter((x): x is NonNullable<typeof x> => !!x) : [];
  const uploads = category === FAVES ? favUploads : category === RECENT ? recentUploads : [];
  const shown = results.slice(0, 240);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex flex-wrap gap-1 px-1">
        {[FAVES, RECENT, ...LIBRARY_CATEGORIES.filter((c) => c !== 'Sketch people' && c !== 'People' && c !== 'Faces')].map((c) => (
          <button key={c} type="button"
            className={'df-ui-anim h-6.5 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors ' + (category === c ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-t2 hover:text-t1')}
            onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11.5px] text-t2" title="Glyphs that exist in colour are shown and added in colour">
        <input type="checkbox" className="accent-[#0d9d97]" checked={prefs.color} onChange={(e) => setColorPictures(e.target.checked)} />
        Colour versions where available
      </label>
      {uploads.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {uploads.map((item) => <UploadTile key={item.id} item={item} onUse={() => { void addGalleryItem(item).then(onAdded); noteUsed(item.id); }} />)}
        </div>
      )}
      {index && (
        <div className="grid grid-cols-4 gap-1.5">
          {shown.map((entry) => (
            <div key={entry.id} className="group relative">
              <button type="button" title={entry.name} aria-label={`Add ${entry.name}`}
                className="df-ui-anim flex h-14 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent hover:bg-accent-weak"
                onClick={() => { void addLibraryIllustration(entry, { color: prefs.color }).then(onAdded); noteUsed(entry.id); }}>
                <img src={pictureSrc(entry, prefs.color)} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />
              </button>
              <StarButton id={entry.id} className="!h-4 !w-4" />
            </div>
          ))}
        </div>
      )}
      {index && results.length === 0 && uploads.length === 0 && (
        <div className="pt-2 text-center text-[12px] text-t3">
          {category === FAVES ? 'Star pictures to collect them here.' : category === RECENT ? 'Pictures you use will show up here.' : 'Nothing here.'}
        </div>
      )}
      {!index && <div className="text-[12px] text-t3">Loading library…</div>}
      <p className="text-[10.5px] leading-relaxed text-t3">Artwork: OpenMoji &amp; Mega Doodles (CC BY-SA 4.0), Open Doodles &amp; Open Peeps (CC0), Tabler Icons, Health Icons, Flowbite &amp; illlustrations.co (MIT) — see CREDITS.</p>
    </div>
  );
}

/** Unified search results across every source. */
function SearchResults({ hits, onAdded }: { hits: SearchHit[]; onAdded?: () => void }) {
  const prefs = useAssetPrefs();
  const use = async (h: SearchHit) => {
    if (h.kind === 'illustration') { await addLibraryIllustration(h.entry, { color: prefs.color }); noteUsed(h.entry.id); }
    else if (h.kind === 'shape') addShapeElement(h.shapeId);
    else if (h.kind === 'icon') addLibraryElement(h.asset);
    else { await addGalleryItem(h.item); noteUsed(h.item.id); }
    onAdded?.();
  };
  const groups: { title: string; hits: SearchHit[] }[] = [
    { title: 'Your uploads', hits: hits.filter((h) => h.kind === 'upload') },
    { title: 'Illustrations', hits: hits.filter((h) => h.kind === 'illustration') },
    { title: 'Shapes & icons', hits: hits.filter((h) => h.kind === 'shape' || h.kind === 'icon') },
  ].filter((g) => g.hits.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-t2">{g.title} <span className="font-normal normal-case tracking-normal text-t3">· {g.hits.length}</span></div>
          <div className="grid grid-cols-4 gap-1.5">
            {g.hits.slice(0, 60).map((h) => (
              <div key={h.id} className="group relative">
                <button type="button" title={h.name} aria-label={`Add ${h.name}`}
                  className="df-ui-anim flex h-14 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak"
                  onClick={() => void use(h)}>
                  {h.kind === 'illustration' && <img src={pictureSrc(h.entry, prefs.color)} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />}
                  {h.kind === 'upload' && <img src={h.item.kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(h.item.data)}` : h.item.data} alt="" className="max-h-[82%] max-w-[82%] object-contain" draggable={false} />}
                  {h.kind === 'icon' && <IconGlyph paths={h.asset.paths} />}
                  {h.kind === 'shape' && <span className="text-[10.5px] font-medium">{h.name}</span>}
                </button>
                {(h.kind === 'illustration' || h.kind === 'upload') && <StarButton id={h.id} className="!h-4 !w-4" />}
                <div className="mt-0.5 truncate text-center text-[9.5px] text-t3">{h.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The library: one search over everything, and tabs for pictures, shapes, people and uploads. */
export function LibraryPanel({ onAdded, initialTab = 'pictures' }: { onAdded?: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<LibraryEntry[] | null>(null);
  const gallery = useGallery();
  const { assetProviders } = usePlugins();
  type PluginHit = { providerId: string; id: string; name: string; svg?: string; imageUrl?: string };
  const [pluginHits, setPluginHits] = useState<PluginHit[]>([]);

  useEffect(() => { loadLibraryIndex().then(setIndex).catch(() => setIndex([])); }, []);
  const searchIndex = useMemo(() => buildIndex({ illustrations: index ?? [], icons: ICONS, uploads: gallery.items }), [index, gallery.items]);
  const hits = useMemo(() => (query.trim() ? searchAll(searchIndex, query) : []), [searchIndex, query]);

  useEffect(() => {
    const q = query.trim();
    if (!q || assetProviders.length === 0) { setPluginHits([]); return; }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const all: PluginHit[] = [];
      for (const p of assetProviders) {
        try { for (const r of (await p.search(q)).slice(0, 24)) all.push({ providerId: p.id, ...r }); } catch { /* ignore a broken provider */ }
      }
      if (!cancelled) setPluginHits(all);
    }, 300);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [query, assetProviders]);

  const usePluginHit = async (h: PluginHit) => {
    if (h.svg) addImportedSvg(h.svg, h.name);
    else if (h.imageUrl) {
      const blob = await (await fetch(h.imageUrl)).blob();
      addImageElement(await loadRasterImage(blob, blob.type || 'image/png'), h.name);
    }
    onAdded?.();
  };

  const searching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-t3" />
        <input
          type="search"
          className="df-input"
          style={{ paddingLeft: 32, paddingRight: 30 }}
          placeholder={index ? `Search ${(index.length + ICONS.length + gallery.items.length).toLocaleString()} pictures, shapes, people, uploads…` : 'Loading library…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {searching && (
          <button type="button" className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-t3 hover:bg-hov hover:text-t1" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={12} />
          </button>
        )}
      </div>
      {searching ? (
        <>
          <SearchResults hits={hits} onAdded={onAdded} />
          {pluginHits.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-t2">From plugins</div>
              <div className="grid grid-cols-4 gap-1.5">
                {pluginHits.map((h) => (
                  <button key={`${h.providerId}:${h.id}`} type="button" title={h.name}
                    className="df-ui-anim flex h-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent"
                    onClick={() => void usePluginHit(h)}>
                    <img src={h.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(h.svg)}` : h.imageUrl} alt="" loading="lazy" className="h-[82%] w-[82%] object-contain" draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {hits.length === 0 && pluginHits.length === 0 && (
            <div className="pt-2 text-center text-[12px] text-t3">
              Nothing matches “{query}”. Try a simpler word — the search understands synonyms (idea → light bulb), plurals and small typos.
            </div>
          )}
        </>
      ) : (
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pictures', label: 'Pictures' },
              { value: 'shapes', label: 'Shapes' },
              { value: 'people', label: 'People' },
              { value: 'uploads', label: 'Uploads' },
            ]}
          />
          {tab === 'pictures' && <PicturesTab index={index} onAdded={onAdded} />}
          {tab === 'shapes' && <ShapesTab />}
          {tab === 'people' && <CharactersPanel onAdded={onAdded} embedded />}
          {tab === 'uploads' && <UploadsPanel onAdded={onAdded} />}
        </>
      )}
    </div>
  );
}
