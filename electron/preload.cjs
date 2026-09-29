// Sandboxed preload. The editor is a self-contained web app and needs no Node
// access, so this exposes only the app version, the native File menu's
// messages, a "save this text to a file" call, a relay to a local voice app
// and the built-in voice behind contextBridge. Kept
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
  /** A request to a local voice app, sent from the main process (local addresses only). */
  localFetch(url, init) {
    return ipcRenderer.invoke('drawflow:local-fetch', { url, ...init });
  },
  /** The built-in offline voice (Kokoro): resolves { wav } or { error }. */
  voiceSpeak(text, voice, speed) {
    return ipcRenderer.invoke('drawflow:voice-speak', { text, voice, speed });
  },
  /** { downloaded } — whether the built-in voice's model is on this computer yet. */
  voiceStatus() {
    return ipcRenderer.invoke('drawflow:voice-status');
  },
  /** Download progress of the built-in voice's model: { loaded, total } in bytes. */
  onVoiceProgress(handler) {
    const fn = (_event, msg) => handler(msg);
    ipcRenderer.on('drawflow:voice-progress', fn);
    return () => ipcRenderer.removeListener('drawflow:voice-progress', fn);
  },
});
