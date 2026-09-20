import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useStore } from './store/useStore';
import { useUiStore, applyTheme } from './store/uiStore';
import { exportBench } from './lib/exportBench';

// eslint-disable-next-line no-console
console.info('[DrawFlow] crossOriginIsolated =', self.crossOriginIsolated);

// theme: follow the saved preference (and the OS when set to "system")
applyTheme(useUiStore.getState().theme);
useUiStore.subscribe((s, prev) => { if (s.theme !== prev.theme) applyTheme(s.theme); });

// a small scripting surface for automation, tests and plugins
declare global {
  interface Window { DrawFlow: { store: typeof useStore; ui: typeof useUiStore; bench: typeof exportBench } }
}
window.DrawFlow = { store: useStore, ui: useUiStore, bench: exportBench };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
