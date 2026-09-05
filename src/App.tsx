import { TopBar } from './components/layout/TopBar';
import { IconRail } from './components/layout/IconRail';
import { Workspace } from './components/layout/Workspace';
import { Inspector } from './components/layout/Inspector';
import { TimelineBar } from './components/layout/TimelineBar';
import { usePlaybackClock } from './hooks/usePlaybackClock';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
  usePlaybackClock();
  useKeyboardShortcuts();

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <IconRail />
        <Workspace />
        <Inspector />
      </div>
      <TimelineBar />
    </div>
  );
}
