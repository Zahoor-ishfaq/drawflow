// Sandboxed preload. The editor is a self-contained web app and needs no Node
// access, so this exposes only the app version behind contextBridge. Kept as
// .cjs because sandboxed preloads must be CommonJS.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('drawflow', {
  version: process.versions.electron,
  isDesktop: true,
});
