// The export details: what an export did and on which hardware, as plain text
// someone can paste into a bug report (the Export dialog's "Copy export
// details"). Only settings, hardware, timings and warnings: never the project's
// name, file names or paths.

export class ExportLog {
  private readonly t0 = performance.now();
  private readonly facts: [string, string][] = [];
  private readonly steps: string[] = [];
  private readonly warnings: string[] = [];
  readonly started = new Date();

  /** A fact for the header, e.g. ("Video encoder", "avc1.640028 on the graphics card"); a repeated key replaces it. */
  fact(key: string, value: string | number): void {
    const i = this.facts.findIndex(([k]) => k === key);
    if (i >= 0) this.facts[i] = [key, String(value)];
    else this.facts.push([key, String(value)]);
  }

  /** A timed step, e.g. "test frame on the graphics card: ok". */
  step(text: string): void {
    this.steps.push(`${((performance.now() - this.t0) / 1000).toFixed(2).padStart(7)} s  ${text}`);
  }

  warn(text: string): void {
    if (this.warnings.length < 40) this.warnings.push(text);
    this.step(`warning: ${text}`);
  }

  text(): string {
    const width = Math.max(...this.facts.map(([k]) => k.length), 8);
    return [
      `DrawFlow export details (${this.started.toISOString().replace('T', ' ').slice(0, 19)} UTC)`,
      '',
      ...this.facts.map(([k, v]) => `${k.padEnd(width)}  ${v}`),
      '',
      'Steps',
      ...this.steps,
      ...(this.warnings.length ? ['', 'Warnings', ...this.warnings.map((w) => `- ${w}`)] : []),
      '',
    ].join('\n');
  }
}

let last: ExportLog | null = null;

/** A new log for the export that is starting (it becomes the one lastExportLog returns). */
export function startExportLog(): ExportLog {
  last = new ExportLog();
  return last;
}

/** The details of the most recent export (finished or failed), or null before the first. */
export function lastExportLog(): ExportLog | null {
  return last;
}

/**
 * Copy the export's own warnings ("[export] …", "[video] …") into the log while
 * it runs. Returns the function that stops copying.
 */
export function captureWarnings(log: ExportLog): () => void {
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (/^\[(export|video)\]/.test(first)) {
      log.warn(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 400));
    }
    original.apply(console, args as []);
  };
  return () => { console.warn = original; };
}

/** The graphics chip the page draws with, as the browser names it (e.g. "ANGLE (NVIDIA, …, D3D11)"). */
function webglRenderer(): string {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name);
  } catch {
    return 'unknown';
  }
}

async function operatingSystem(): Promise<string> {
  const ua = navigator.userAgent;
  try {
    const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ platform?: string; platformVersion?: string }> } }).userAgentData;
    if (data) {
      const v = await data.getHighEntropyValues(['platformVersion']);
      if (v.platform === 'Windows' && v.platformVersion) return parseInt(v.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
      if (v.platform) return `${v.platform} ${v.platformVersion ?? ''}`.trim();
    }
  } catch { /* fall back to the user agent */ }
  return /Windows NT 10/.test(ua) ? 'Windows 10 or 11' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';
}

/** Hardware and software facts for the log's header. */
export async function describeEnvironment(log: ExportLog): Promise<void> {
  const desktop = typeof window !== 'undefined' ? window.drawflow : undefined;
  let gpu: Awaited<ReturnType<NonNullable<DesktopBridge['gpuInfo']>>> | null = null;
  try { gpu = (await desktop?.gpuInfo?.()) ?? null; } catch { gpu = null; }
  const browser = navigator.userAgent.match(/(Edg|Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? 'unknown';
  log.fact('DrawFlow', gpu ? `${gpu.appVersion} (desktop app)` : 'web app');
  log.fact('System', `${await operatingSystem()}, ${navigator.hardwareConcurrency || '?'} processor threads, ${browser}`);
  log.fact('Draws with', webglRenderer());
  if (gpu) {
    gpu.devices.forEach((d, i) => log.fact(`Graphics chip ${i + 1}`, `${d.name}${d.driver ? `, driver ${d.driver}` : ''}${d.active ? '  (in use)' : ''}`));
    log.fact('GPU video', `encode ${gpu.features.videoEncode}, decode ${gpu.features.videoDecode}`);
  }
}
