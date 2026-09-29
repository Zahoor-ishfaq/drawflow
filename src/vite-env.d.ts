/// <reference types="vite/client" />

/** Bridge exposed by the desktop app's preload (absent in the browser). */
interface DesktopBridge {
  version: string;
  isDesktop: true;
  onMenu(handler: (msg: { action: string; name?: string; text?: string }) => void): () => void;
  saveFile(filename: string, text: string): Promise<boolean>;
  /** Relay to a local voice app (the page's CSP blocks it); older builds lack it. */
  localFetch?(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<
    { status: number; statusText: string; contentType: string; body: Uint8Array } | { error: string; unreachable?: boolean }
  >;
  /** The built-in offline voice (Kokoro, desktop only; older builds lack it). */
  voiceSpeak?(text: string, voice: string, speed?: number): Promise<{ wav: Uint8Array } | { error: string }>;
  voiceStatus?(): Promise<{ downloaded: boolean }>;
  onVoiceProgress?(handler: (msg: { loaded: number; total: number }) => void): () => void;
}
interface Window {
  drawflow?: DesktopBridge;
}
