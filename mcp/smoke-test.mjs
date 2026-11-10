#!/usr/bin/env node
// End-to-end check of the DrawFlow MCP server through a real MCP client over
// stdio: create a project, add three scenes (text, library picture, inline
// SVG, image file), narrate them (built-in voice and an audio file), preview,
// render, and decode the MP4. Run after `npm run build`:
//
//   npm run test:mcp            (output in <temp>/drawflow-mcp-test)
//
// DRAWFLOW_TEST_EXE=<path to DrawFlow.exe> tests the server inside a built app
// instead, launched exactly the way the "Connect AI (MCP)" button sets it up.
//
// The first run downloads the built-in voice model (~92 MB).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../cli/app-session.mjs';

const { GIFEncoder } = createRequire(import.meta.url)('gifenc');

const OUT = path.join(os.tmpdir(), 'drawflow-mcp-test');
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures++; };

/** Two seconds of a soft tone as 16-bit mono WAV — the "audio file" voiceover. */
function toneWav(rate = 24000, seconds = 2) {
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 6000 * Math.min(1, (n - i) / 2400)), 44 + i * 2);
  return buf;
}
const wav = path.join(OUT, 'tone.wav');
await writeFile(wav, toneWav());

const env = { ...process.env, DRAWFLOW_PROJECTS: OUT };
delete env.ELECTRON_RUN_AS_NODE;
const EXE = process.env.DRAWFLOW_TEST_EXE;
if (EXE) env.ELECTRON_RUN_AS_NODE = '1';
const serverArgs = EXE ? [path.join(path.dirname(EXE), 'resources', 'app.asar', 'electron', 'mcp', 'server.cjs')] : [path.join(ROOT, 'mcp', 'server.mjs')];
const transport = new StdioClientTransport({ command: EXE ?? process.execPath, args: serverArgs, env, stderr: 'pipe' });
transport.stderr?.on('data', (d) => process.stderr.write(`    server: ${d}`));
const client = new Client({ name: 'drawflow-smoke-test', version: '1.0.0' });
// stdout must carry nothing but protocol messages: the client reports anything else as an error
const stray = [];
client.onerror = (e) => stray.push(String(e?.message ?? e));
await client.connect(transport);

async function call(name, args = {}, opts = {}) {
  const t = Date.now();
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 900_000, ...opts });
  const msg = r.content.find((c) => c.type === 'text')?.text ?? '';
  console.log(`${name} (${((Date.now() - t) / 1000).toFixed(1)} s)${r.isError ? ` → error: ${msg}` : ''}`);
  return { ...r, msg, json: () => JSON.parse(msg) };
}

const { tools } = await client.listTools();
check(['create_project', 'add_scene', 'add_voiceover', 'add_motion_path', 'set_subtitles', 'import_subtitles', 'get_preview', 'render', 'check_job', 'list_projects', 'get_project', 'list_voices'].every((n) => tools.some((t) => t.name === n)), 'all tools listed');
check((client.getInstructions() ?? '').includes('create_project'), 'tells the assistant how to make a video');
check((await client.listPrompts()).prompts.some((p) => p.name === 'make_whiteboard_video'), 'offers a make_whiteboard_video prompt');

check(!(await call('create_project', { title: 'Smoke Test', resolution: '720p', fps: 30 })).isError, 'project created');
check((await call('create_project', { title: 'Smoke Test' })).isError, 'duplicate project refused');

const rocket = '<svg viewBox="0 0 200 200" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"><path d="M100 20 C130 50 135 100 125 140 L75 140 C65 100 70 50 100 20 Z"/><circle cx="100" cy="80" r="14"/><path d="M75 120 L50 150 L75 145 M125 120 L150 150 L125 145 M88 150 L100 180 L112 150"/></svg>';
check(!(await call('add_scene', { project: 'Smoke Test', name: 'Idea', content: [{ type: 'text', text: 'Big ideas', size: 'title' }, { type: 'library', query: 'light bulb' }], hold_duration: 1 })).isError, 'scene 1: text + library picture');
check(!(await call('add_scene', { project: 'Smoke Test', name: 'Plan', content: [{ type: 'svg', svg: rocket, label: 'Rocket' }, { type: 'text', text: 'Sketch it' }], draw_duration: 2 })).isError, 'scene 2: inline SVG + text');
check(!(await call('add_scene', { project: 'smoke-test', name: 'Launch', content: [{ type: 'image', path: path.join(ROOT, 'build', 'icon.png') }, { type: 'text', text: 'Ship it!', size: 'title' }] })).isError, 'scene 3: image file + text');

check(!(await call('add_voiceover', { project: 'Smoke Test', scene: '1', text: 'Every big project starts with a single bright idea.' })).isError, 'voiceover 1 from text (built-in voice)');
check(!(await call('add_voiceover', { project: 'Smoke Test', scene: 'Plan', audio_path: wav })).isError, 'voiceover 2 from an audio file');
check(!(await call('add_voiceover', { project: 'Smoke Test', scene: 'Launch', text: 'And then you ship it.', voice: 'bm_george' })).isError, 'voiceover 3 from text, another voice');
check((await call('add_voiceover', { project: 'Smoke Test', scene: '9', text: 'nope' })).isError, 'unknown scene refused');
// a longer take on scene 1 moves scenes 2 and 3: their voiceovers must move along
check(!(await call('add_voiceover', { project: 'Smoke Test', scene: 'Idea', text: 'Every big project starts with a single bright idea. Write it down before it slips away.' })).isError, 'scene 1 re-narrated');

const d = (await call('get_project', { project: 'Smoke Test' })).json();
check(d.scenes.length === 3 && d.exportHeight === 720, '3 scenes, 720p output');
d.scenes.forEach((sc, i) => {
  const v = sc.voiceovers[0];
  const next = d.scenes[i + 1]?.voiceovers[0];
  check(!!v && Math.abs(v.start - sc.items[0].start) < 0.02 && (!next || v.start + v.duration <= next.start), `scene ${i + 1}: voiceover starts with its drawing and ends before the next`);
});

for (const sc of ['1', '2', '3']) {
  const r = await call('get_preview', { project: 'Smoke Test', scene: sc });
  const img = r.content.find((c) => c.type === 'image');
  if (img) await writeFile(path.join(OUT, `preview-${sc}.png`), Buffer.from(img.data, 'base64'));
  check(!!img && img.data.length > 1000, `preview of scene ${sc}`);
  // a "fully drawn" preview must not land in the next scene's fade (it would look washed out)
  const at = parseFloat(/Frame at ([\d.]+) s/.exec(r.msg)?.[1] ?? 'NaN');
  const next = d.scenes[parseInt(sc, 10)];
  if (next) check(at < next.start - 0.3, `preview of scene ${sc} is taken before the fade (${at} s)`);
}

let progress = 0;
const rendered = await call('render', { project: 'Smoke Test' }, { onprogress: () => { progress++; }, resetTimeoutOnProgress: true });
check(!rendered.isError, `rendered (${progress} progress updates)`);
check((await call('list_projects')).json().some((p) => p.project === 'smoke-test'), 'listed');
check((await call('get_preview', { project: 'no such project' })).isError, 'unknown project refused');

// a GIF on the board and subtitles, the way an assistant asks for them
const gif = GIFEncoder();
for (const c of [[230, 30, 30], [30, 30, 230]]) gif.writeFrame(new Uint8Array(64 * 64), 64, 64, { palette: [c, [0, 0, 0]], delay: 300 });
gif.finish();
await writeFile(path.join(OUT, 'dots.gif'), gif.bytes());
await writeFile(path.join(OUT, 'zh.srt'), '1\n00:00:00,500 --> 00:00:02,000\n你好，世界\n');
const untilDone = async (r) => {
  let cur = r;
  while (!cur.isError && cur.json().status === 'working') cur = await call('check_job', { job: cur.json().job });
  return cur;
};
check(!(await call('create_project', { title: 'Subtitled', resolution: '720p', fps: 30 })).isError, 'second project created');
check(!(await call('add_scene', { project: 'Subtitled', name: 'Clip', content: [{ type: 'image', path: path.join(OUT, 'dots.gif') }] })).isError, 'an animated GIF goes on the board');
const flight = await call('add_motion_path', { project: 'Subtitled', scene: 'Clip', points: [[250, -120], [500, -60]], duration: 2, orient: true });
check(!flight.isError && flight.json().end > flight.json().start, 'the GIF flies along a motion path');
check((await call('get_project', { project: 'Subtitled' })).json().scenes[0].items[0].motionPath?.points === 3, 'get_project reports the path');
check((await call('add_motion_path', { project: 'Subtitled', scene: 'Clip', item: 5, points: [[10, 10]] })).isError, 'a missing item is refused');
check(!(await untilDone(await call('add_voiceover', { project: 'Subtitled', scene: '1', text: 'One short line. And one more after it.' }))).isError, 'voiceover for the subtitles');
const look = await call('set_subtitles', { project: 'Subtitled', show: true, position: 'top', size: 52 });
check(!look.isError && look.json().lines >= 1 && look.json().position === 'top', 'subtitles on, at the top');
check((await call('get_project', { project: 'Subtitled' })).json().subtitles?.show === true, 'get_project reports them');
check(!(await call('get_preview', { project: 'Subtitled', time: 1 })).isError, 'preview with a subtitle');
const subtitled = await untilDone(await call('render', { project: 'Subtitled' }));
check(!subtitled.isError && subtitled.json().subtitles?.endsWith('.srt'), 'render writes an .srt beside the video');
check((await readFile(subtitled.json().subtitles, 'utf8')).includes('One short line.'), 'the .srt has the narration');
const zh = await call('import_subtitles', { project: 'Subtitled', path: path.join(OUT, 'zh.srt') });
check(!zh.isError && zh.json().lines === 1, 'an .srt file imports');
check((await call('import_subtitles', { project: 'Subtitled', path: path.join(OUT, 'nope.srt') })).isError, 'a missing .srt is refused');
check(stray.length === 0, `stdout carried only protocol messages${stray.length ? ` (${stray[0]})` : ''}`);
await client.close();

// decode the MP4 in a browser engine: picture size, length, and a real audio track
const { launchBrowser } = await import('../cli/app-session.mjs');
const browser = await launchBrowser({ executable: process.env.DRAWFLOW_BROWSER });
const page = await browser.newPage();
const probe = await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const v = document.createElement('video');
  v.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('the video did not load')); });
  const audio = await new AudioContext().decodeAudioData(bytes.buffer.slice(0));
  let peak = 0;
  for (const x of audio.getChannelData(0)) peak = Math.max(peak, Math.abs(x));
  return { seconds: v.duration, width: v.videoWidth, height: v.videoHeight, audioSeconds: audio.duration, peak };
}, (await readFile(path.join(OUT, 'smoke-test.mp4'))).toString('base64'));
await browser.close();
check(probe.width === 1280 && probe.height === 720, `MP4 is ${probe.width}x${probe.height}`);
check(Math.abs(probe.seconds - d.duration) < 0.5, `MP4 lasts ${probe.seconds.toFixed(1)} s (project ${d.duration} s)`);
check(probe.peak > 0.05, `MP4 has audible narration (peak ${probe.peak.toFixed(2)})`);

console.log(`\n${failures ? `${failures} check(s) failed` : 'all checks passed'} — output in ${OUT}`);
process.exit(failures ? 1 : 0);
