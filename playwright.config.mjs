// End-to-end tests run against the built app (dist/) served by `vite preview`
// in a system Chromium-based browser, so no browser download is needed.
// Pick the browser with DRAWFLOW_BROWSER=chrome|msedge|chromium (default: msedge).

import { defineConfig } from '@playwright/test';

const channel = process.env.DRAWFLOW_BROWSER ?? 'msedge';

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: channel === 'chromium' ? undefined : channel,
    viewport: { width: 1500, height: 900 },
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
    permissions: ['microphone'],
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
