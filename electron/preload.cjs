// Sandboxed preload. The editor is a self-contained web app and needs no Node
// access, so this exposes only the app version, the native File menu's
// messages and a "save this text to a file" call behind contextBridge. Kept
// as .cjs because sandboxed preloads must be CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drawflow', {
  version: process.versions.electron,
  isDesktop: true,
  /** File-menu actions from the main process: { action, name?, text? } */
  onMenu(handler) {
    const fn = (_event, msg) => handler(msg);
    ipcRenderer.on('drawflow:menu', fn);
    return () => ipcRenderer.removeListener('drawflow:menu', fn);
  },
  /** Native save dialog for a project file; resolves true when written. */
  saveFile(filename, text) {
    return ipcRenderer.invoke('drawflow:save-file', { filename, text });
  },
});
