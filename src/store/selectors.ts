import { useMemo } from 'react';
import { useStore } from './useStore';
import type { DrawElement } from '../types';
import { makeRenderContext, type RenderContext } from '../lib/renderFrame';

export function useSelectedElement(): DrawElement | null {
  return useStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);
}

/** Elements in play order (= stacking order). */
export function useSequence(): DrawElement[] {
  const elements = useStore((s) => s.elements);
  return useMemo(() => [...elements].sort((a, b) => a.zIndex - b.zIndex), [elements]);
}

/** Memoized camera timeline + ordered elements for the current document. */
export function useRenderContext(): RenderContext {
  const elements = useStore((s) => s.elements);
  const project = useStore((s) => s.project);
  return useMemo(() => makeRenderContext(project, elements), [project, elements]);
}
