import { TopBar } from './components/layout/TopBar';
import { LeftRail } from './components/layout/LeftRail';
import { Workspace } from './components/layout/Workspace';
import { Inspector } from './components/layout/Inspector';
import { Timeline } from './components/layout/Timeline';
import { usePlaybackClock } from './hooks/usePlaybackClock';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
  usePlaybackClock();
  useKeyboardShortcuts();

  return (
    <div className="flex h-full min-w-[1280px] flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <Workspace />
        <Inspector />
      </div>
      <Timeline />
    </div>
  );
}
