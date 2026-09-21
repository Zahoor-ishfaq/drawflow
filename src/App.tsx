import { TopBar } from './components/layout/TopBar';
import { IconRail } from './components/layout/IconRail';
import { Workspace } from './components/layout/Workspace';
import { Inspector } from './components/layout/Inspector';
import { TimelineBar } from './components/layout/TimelineBar';
import { usePlaybackClock } from './hooks/usePlaybackClock';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEffect, useState } from 'react';
import { restoreLast, startAutosave } from './lib/persistence';
import { useUiStore } from './store/uiStore';
import { onShortcut } from './hooks/useKeyboardShortcuts';
import { FullscreenPreview } from './components/layout/FullscreenPreview';
import { CommandPalette } from './components/layout/CommandPalette';
import { ProblemHost } from './components/dialogs/ProblemDialog';
import { TourOverlay } from './components/help/TourOverlay';

export default function App() {
  usePlaybackClock();
  useKeyboardShortcuts();
  const [restored, setRestored] = useState<boolean | null>(null);
  const [palette, setPalette] = useState(false);
  const fullscreen = useUiStore((s) => s.fullscreenPreview);
  useEffect(() => onShortcut((n) => {
    if (n === 'command-palette') setPalette((v) => !v);
    if (n === 'fullscreen-preview') useUiStore.getState().set({ fullscreenPreview: !useUiStore.getState().fullscreenPreview });
  }), []);

  // restore the last checkpoint, then keep checkpointing every change
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    restoreLast()
      .then((ok) => { if (!cancelled) setRestored(ok); })
      .catch(() => { if (!cancelled) setRestored(false); })
      .finally(() => { if (!cancelled) stop = startAutosave(); });
    return () => { cancelled = true; stop?.(); };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <IconRail />
        <Workspace />
        <Inspector />
      </div>
      <TimelineBar />
      {restored && <RestoredToast onDone={() => setRestored(null)} />}
      {fullscreen && <FullscreenPreview />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <ProblemHost />
      <TourOverlay />
    </div>
  );
}

function RestoredToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed bottom-[230px] left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-panel px-4 py-2 text-[12.5px] text-t1 shadow-[0_8px_24px_rgba(25,35,55,0.18)]">
      Restored your last session
    </div>
  );
}
