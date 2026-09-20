// Editor preferences that are not part of the document (no undo history,
// persisted in localStorage): snapping, rulers, theme, panel sizes.

import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

export interface UiState {
  snapToGrid: boolean;
  gridSize: number;          // canvas px
  showRulers: boolean;
  showGuides: boolean;       // smart alignment guides while dragging
  theme: Theme;
  timelineHeight: number;    // px
  libraryWidth: number;      // px
  inspectorWidth: number;    // px
  showStats: boolean;        // fps / render timing overlay
  fullscreenPreview: boolean;
  lowQualityPreview: boolean;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

const KEY = 'drawflow.ui';

function load(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<UiState>) : {};
  } catch {
    return {};
  }
}

export const useUiStore = create<UiState>()((set, get) => ({
  snapToGrid: false,
  gridSize: 40,
  showRulers: false,
  showGuides: true,
  theme: 'system',
  timelineHeight: 0, // 0 = default layout
  libraryWidth: 340,
  inspectorWidth: 290,
  showStats: false,
  fullscreenPreview: false,
  lowQualityPreview: false,
  ...load(),
  set(patch) {
    set(patch);
    const { set: _s, fullscreenPreview: _f, ...rest } = get();
    try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* quota */ }
  },
}));

/** Snap a canvas coordinate to the grid when snapping is on. */
export function snap(v: number): number {
  const { snapToGrid, gridSize } = useUiStore.getState();
  return snapToGrid && gridSize > 0 ? Math.round(v / gridSize) * gridSize : v;
}

/** Apply the theme to <html data-theme>; 'system' follows the OS. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
