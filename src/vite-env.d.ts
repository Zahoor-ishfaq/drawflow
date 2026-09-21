/// <reference types="vite/client" />

/** Bridge exposed by the desktop app's preload (absent in the browser). */
interface DesktopBridge {
  version: string;
  isDesktop: true;
  onMenu(handler: (msg: { action: string; name?: string; text?: string }) => void): () => void;
  saveFile(filename: string, text: string): Promise<boolean>;
}
interface Window {
  drawflow?: DesktopBridge;
}
