import { useEffect } from 'react';
import { redo, undo, useStore } from '../store/useStore';

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

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.isExporting) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }

      if (inTextField(e)) return;

      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (s.selectedId) s.duplicateElement(s.selectedId);
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (s.isPlaying) s.pause();
          else s.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          s.pause();
          s.setTime(s.currentTime - 1 / s.project.fps);
          break;
        case 'ArrowRight':
          e.preventDefault();
          s.pause();
          s.setTime(s.currentTime + 1 / s.project.fps);
          break;
        case 'Delete':
        case 'Backspace':
          if (s.selectedId) {
            e.preventDefault();
            s.removeElement(s.selectedId);
          }
          break;
        case 'Escape':
          s.select(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
