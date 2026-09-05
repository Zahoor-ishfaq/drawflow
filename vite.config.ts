import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// COOP/COEP make the page cross-origin isolated, which ffmpeg.wasm's
// SharedArrayBuffer usage requires (see spec §3). Production hosts must
// send the same two headers (see public/_headers for Netlify).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // ffmpeg ships ESM that Vite shouldn't pre-bundle
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
