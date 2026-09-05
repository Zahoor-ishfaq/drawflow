import { useStore } from './useStore';
import type { DrawElement } from '../types';

export function useSelectedElement(): DrawElement | null {
  return useStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);
}

export function useElementsByZ(): DrawElement[] {
  const elements = useStore((s) => s.elements);
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/** Timeline rows: top row = topmost layer (highest zIndex). */
export function useTrackOrder(): DrawElement[] {
  const elements = useStore((s) => s.elements);
  return [...elements].sort((a, b) => b.zIndex - a.zIndex);
}
