import { useState } from 'react';
import { Segmented } from '../ui/Segmented';
import { AddPanel } from '../library/AddPanel';
import { LibraryPanel } from '../library/LibraryPanel';

export function LeftRail() {
  const [tab, setTab] = useState<'add' | 'library'>('add');
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="p-3 pb-0">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'add', label: 'Add' },
            { value: 'library', label: 'Library' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'add' ? <AddPanel /> : <LibraryPanel />}
      </div>
    </aside>
  );
}
