import { useEffect } from 'react';
import { redo, undo, useStore } from '../store/useStore';
import { useUiStore } from '../store/uiStore';

function inTextField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  );
}

/** Custom events the shortcuts fire for parts of the UI that own the behaviour. */
export type ShortcutEvent =
  | 'zoom-in' | 'zoom-out' | 'zoom-fit' | 'zoom-100' | 'zoom-selection'
  | 'command-palette' | 'fullscreen-preview' | 'shortcuts-help'
  | 'open-projects' | 'open-templates' | 'open-versions' | 'open-export';

export function emitShortcut(name: ShortcutEvent): void {
  window.dispatchEvent(new CustomEvent('drawflow:shortcut', { detail: name }));
}

export function onShortcut(handler: (name: ShortcutEvent) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<ShortcutEvent>).detail);
  window.addEventListener('drawflow:shortcut', fn);
  return () => window.removeEventListener('drawflow:shortcut', fn);
}

/** All shortcuts, for the help sheet and the command palette. */
export const SHORTCUTS: { keys: string; action: string; group: string }[] = [
  { group: 'Playback', keys: 'Space', action: 'Play / pause' },
  { group: 'Playback', keys: 'Home / End', action: 'Go to start / end' },
  { group: 'Playback', keys: ', / .', action: 'Step one frame back / forward' },
  { group: 'Playback', keys: 'Shift+F', action: 'Full-screen preview' },
  { group: 'Playback', keys: 'M', action: 'Add a marker at the playhead' },
  { group: 'Editing', keys: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Undo / redo' },
  { group: 'Editing', keys: 'Ctrl+C / Ctrl+X / Ctrl+V', action: 'Copy / cut / paste' },
  { group: 'Editing', keys: 'Ctrl+D', action: 'Duplicate' },
  { group: 'Editing', keys: 'Ctrl+A', action: 'Select all' },
  { group: 'Editing', keys: 'Delete', action: 'Delete selection' },
  { group: 'Editing', keys: 'Arrows / Shift+Arrows', action: 'Nudge 1 px / 10 px' },
  { group: 'Editing', keys: 'Ctrl+G / Ctrl+Shift+G', action: 'Group / ungroup' },
  { group: 'Editing', keys: 'Ctrl+L', action: 'Lock / unlock' },
  { group: 'Editing', keys: 'Ctrl+Shift+H', action: 'Hide / show' },
  { group: 'Editing', keys: '[ / ]', action: 'Send backward / bring forward' },
  { group: 'Editing', keys: 'Ctrl+[ / Ctrl+]', action: 'Send to back / bring to front' },
  { group: 'Editing', keys: 'Ctrl+Shift+C / Ctrl+Shift+V', action: 'Copy / paste animation settings' },
  { group: 'Editing', keys: 'Esc', action: 'Deselect' },
  { group: 'Canvas', keys: 'Drag paper / Middle-drag', action: 'Pan' },
  { group: 'Canvas', keys: 'Shift+drag paper', action: 'Marquee select' },
  { group: 'Canvas', keys: 'Wheel / Ctrl+= / Ctrl+-', action: 'Zoom' },
  { group: 'Canvas', keys: 'Ctrl+0 / Ctrl+1', action: 'Fit everything / 100%' },
  { group: 'Canvas', keys: 'F', action: 'Frame the selection' },
  { group: 'Canvas', keys: 'Ctrl+\'', action: 'Toggle snap to grid' },
  { group: 'Canvas', keys: 'Ctrl+R', action: 'Toggle rulers' },
  { group: 'Audio', keys: 'S', action: 'Split the selected clip at the playhead' },
  { group: 'App', keys: 'Ctrl+K', action: 'Command palette' },
  { group: 'App', keys: 'Ctrl+O', action: 'Projects & templates' },
  { group: 'App', keys: 'Ctrl+E', action: 'Export' },
  { group: 'App', keys: 'Ctrl+S', action: 'Version history (projects save themselves)' },
  { group: 'App', keys: '?', action: 'Keyboard shortcuts' },
];

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.isExporting) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const ids = s.selectedIds;
      const clipId = s.selectedId?.startsWith('clip:') ? s.selectedId.slice(5) : null;

      // undo/redo work everywhere, even in text fields
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); redo(); return; }
      if (mod && key === 'k') { e.preventDefault(); emitShortcut('command-palette'); return; }

      if (inTextField(e)) return;

      if (mod) {
        switch (key) {
          case 'd': e.preventDefault(); if (ids.length) s.duplicateElements(ids); else if (clipId) s.duplicateAudioClip(clipId); return;
          case 'c': e.preventDefault(); if (e.shiftKey) { if (s.selectedId && !clipId) s.copyAnimation(s.selectedId); } else if (ids.length) s.copy(ids); return;
          case 'x': e.preventDefault(); if (ids.length) s.cut(ids); return;
          case 'v': e.preventDefault(); if (e.shiftKey) { if (ids.length) s.pasteAnimation(ids); } else s.paste(); return;
          case 'a': e.preventDefault(); s.selectAll(); return;
          case 'g': e.preventDefault(); if (e.shiftKey) { if (s.selectedId) s.ungroup(s.selectedId); } else if (ids.length > 1) s.group(ids); return;
          case 'l': e.preventDefault(); if (ids.length) s.updateElements(ids, (el) => ({ locked: !el.locked })); return;
          case 'h': if (e.shiftKey) { e.preventDefault(); if (ids.length) s.updateElements(ids, (el) => ({ hidden: !el.hidden })); } return;
          case '[': e.preventDefault(); if (ids.length) s.setLayer(ids, 'back'); return;
          case ']': e.preventDefault(); if (ids.length) s.setLayer(ids, 'front'); return;
          case '=': case '+': e.preventDefault(); emitShortcut('zoom-in'); return;
          case '-': e.preventDefault(); emitShortcut('zoom-out'); return;
          case '0': e.preventDefault(); emitShortcut('zoom-fit'); return;
          case '1': e.preventDefault(); emitShortcut('zoom-100'); return;
          case "'": e.preventDefault(); useUiStore.getState().set({ snapToGrid: !useUiStore.getState().snapToGrid }); return;
          case 'r': e.preventDefault(); useUiStore.getState().set({ showRulers: !useUiStore.getState().showRulers }); return;
          case 'o': e.preventDefault(); emitShortcut('open-projects'); return;
          case 'e': e.preventDefault(); emitShortcut('open-export'); return;
          case 's': e.preventDefault(); emitShortcut('open-versions'); return;
        }
        return;
      }

      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        s.nudge(ids, dx * step, dy * step);
      };

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (s.isPlaying) s.pause();
          else s.play();
          break;
        case 'ArrowLeft':
          if (ids.length && !s.cameraView) nudge(-1, 0);
          else { e.preventDefault(); s.pause(); s.setTime(s.currentTime - 1 / s.project.fps); }
          break;
        case 'ArrowRight':
          if (ids.length && !s.cameraView) nudge(1, 0);
          else { e.preventDefault(); s.pause(); s.setTime(s.currentTime + 1 / s.project.fps); }
          break;
        case 'ArrowUp':
          if (ids.length && !s.cameraView) nudge(0, -1);
          break;
        case 'ArrowDown':
          if (ids.length && !s.cameraView) nudge(0, 1);
          break;
        case ',':
          e.preventDefault(); s.pause(); s.setTime(s.currentTime - 1 / s.project.fps);
          break;
        case '.':
          e.preventDefault(); s.pause(); s.setTime(s.currentTime + 1 / s.project.fps);
          break;
        case 'Home':
          e.preventDefault(); s.pause(); s.setTime(0);
          break;
        case 'End':
          e.preventDefault(); s.pause(); s.setTime(s.project.duration);
          break;
        case 'Delete':
        case 'Backspace':
          if (clipId) { e.preventDefault(); s.removeAudioClip(clipId); }
          else if (ids.length) { e.preventDefault(); s.removeElements(ids); }
          break;
        case 'Escape':
          if (useUiStore.getState().fullscreenPreview) useUiStore.getState().set({ fullscreenPreview: false });
          s.select(null);
          break;
        case '[':
          if (ids.length) { e.preventDefault(); s.setLayer(ids, 'backward'); }
          break;
        case ']':
          if (ids.length) { e.preventDefault(); s.setLayer(ids, 'forward'); }
          break;
        case 's':
        case 'S':
          if (clipId) { e.preventDefault(); s.splitAudioClip(clipId, s.currentTime); }
          break;
        case 'm':
        case 'M':
          e.preventDefault(); s.addMarker(s.currentTime);
          break;
        case 'f':
          e.preventDefault(); emitShortcut('zoom-selection');
          break;
        case 'F':
          e.preventDefault(); emitShortcut('fullscreen-preview');
          break;
        case '?':
          e.preventDefault(); emitShortcut('shortcuts-help');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
