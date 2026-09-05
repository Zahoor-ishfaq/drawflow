import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// eslint-disable-next-line no-console
console.info('[DrawFlow] crossOriginIsolated =', self.crossOriginIsolated);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
