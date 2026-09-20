import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { loadLibraryIndex, searchLibrary, type LibraryEntry } from '../../assets/illustrations';
import { addLibraryIllustration } from '../../lib/addElements';
import { noteUsed } from '../../lib/assetPrefs';

const SECTIONS: { title: string; hint: string; category: string; filter?: (e: LibraryEntry) => boolean }[] = [
  { title: 'Poses', hint: 'Sketchy full-body people: sitting, reading, running, dancing, meditating…', category: 'Sketch people' },
  { title: 'Expressions', hint: 'Faces for reactions and moods', category: 'Faces' },
  { title: 'Gestures & hands', hint: 'Pointing, waving, thumbs up, handshakes…', category: 'People', filter: (e) => /hand|point|wave|thumb|clap|fist|ok|pray|shake|finger|palm/i.test(`${e.name} ${e.tags.join(' ')}`) },
  { title: 'People & roles', hint: 'Students, workers, professionals…', category: 'People', filter: (e) => !/hand|point|wave|thumb|clap|fist|ok|pray|shake|finger|palm/i.test(`${e.name} ${e.tags.join(' ')}`) },
];

/** Curated view of the library's people: poses, expressions, gestures, roles. */
export function CharactersPanel({ onAdded, embedded = false }: { onAdded?: () => void; embedded?: boolean }) {
  const [index, setIndex] = useState<LibraryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { loadLibraryIndex().then(setIndex).catch(() => setIndex([])); }, []);

  const sections = useMemo(() => {
    if (!index) return [];
    const q = query.trim();
    return SECTIONS.map((sec) => ({
      ...sec,
      entries: searchLibrary(index, q, sec.category).filter((e) => !sec.filter || sec.filter(e)).slice(0, 48),
    })).filter((sec) => sec.entries.length > 0);
  }, [index, query]);

  const use = async (entry: LibraryEntry) => {
    await addLibraryIllustration(entry);
    noteUsed(entry.id);
    onAdded?.();
  };

  return (
    <div className={'flex flex-col gap-3 ' + (embedded ? '' : 'p-4')}>
      {!embedded && (
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-t3" />
          <input type="search" className="df-input" style={{ paddingLeft: 32 }} placeholder="Search characters…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {!index && <div className="text-[12px] text-t3">Loading…</div>}
      {sections.map((sec) => (
        <div key={sec.title}>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">{sec.title}</div>
          <div className="mb-1.5 text-[10.5px] text-t3">{sec.hint}</div>
          <div className={'grid gap-1.5 ' + (sec.category === 'Sketch people' ? 'grid-cols-3' : 'grid-cols-4')}>
            {sec.entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                title={entry.name}
                aria-label={`Add ${entry.name}`}
                className={'df-ui-anim flex items-center justify-center overflow-hidden rounded-xl border border-line bg-panel2 transition-colors hover:border-accent hover:bg-accent-weak ' + (sec.category === 'Sketch people' ? 'h-24' : 'h-14')}
                onClick={() => void use(entry)}
              >
                <img src={entry.src} alt="" loading="lazy" className="h-[84%] w-[84%] object-contain" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10.5px] leading-relaxed text-t3">
        Combine a pose with a face or a prop from the Images library, then group them (Ctrl+G) to move them as one character.
        Give the character an emphasis effect (bounce, shake) to make it act. Open Doodles (CC0) · OpenMoji (CC BY-SA 4.0).
      </p>
    </div>
  );
}
