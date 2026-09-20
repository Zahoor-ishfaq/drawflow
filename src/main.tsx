import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useUiStore, applyTheme } from './store/uiStore';
import { installApi, type DrawFlowApi } from './lib/api';

// eslint-disable-next-line no-console
console.info('[DrawFlow] crossOriginIsolated =', self.crossOriginIsolated);

// theme: follow the saved preference (and the OS when set to "system")
applyTheme(useUiStore.getState().theme);
useUiStore.subscribe((s, prev) => { if (s.theme !== prev.theme) applyTheme(s.theme); });

// scripting surface for the CLI, tests, benchmarks and plugins
declare global {
  interface Window { DrawFlow: DrawFlowApi }
}
installApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
