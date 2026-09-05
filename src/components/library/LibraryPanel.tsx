import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LIBRARY, LIBRARY_GROUPS } from '../../assets/library';
import { addLibraryElement } from '../../lib/addElements';

export function LibraryPanel() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LIBRARY;
    return LIBRARY.filter(
      (a) => a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="p-4">
      <div className="relative mb-3">
        <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-t3" />
        <input
          type="search"
          className="df-input pl-7"
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {LIBRARY_GROUPS.map((group) => {
        const items = filtered.filter((a) => a.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="mb-3">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-t2">
              {group}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  title={asset.name}
                  aria-label={`Add ${asset.name}`}
                  className="df-ui-anim flex h-14 items-center justify-center rounded-xl border border-line bg-panel2 text-t2 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
                  onClick={() => addLibraryElement(asset)}
                >
                  <svg viewBox="0 0 24 24" width={20} height={20} fill="none"
                    stroke="currentColor" strokeWidth={1.6}
                    strokeLinecap="round" strokeLinejoin="round">
                    {asset.paths.map((d, i) => <path key={i} d={d} />)}
                  </svg>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="pt-4 text-center text-[12px] text-t3">No assets match “{query}”</div>
      )}
    </div>
  );
}
