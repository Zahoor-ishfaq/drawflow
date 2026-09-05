import type { ReactNode } from 'react';

/** Label-above-control field used across the inspector. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-t2">{label}</span>
      {children}
    </label>
  );
}

/** Thin uppercase section header with hairline divider. */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 mb-2 border-t border-line pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-t2">
        {children}
      </span>
    </div>
  );
}
