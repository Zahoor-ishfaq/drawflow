// Bundles electron/voice-worker.cjs (Kokoro + transformers.js + the eSpeak
// phonemizer) into one file for the installer, which ships no node_modules
// except the native ONNX runtime. Also copies the voices DrawFlow offers:
// kokoro-js reads them from ../voices next to the running script.
//
//   electron/voice/worker.cjs   the bundle
//   electron/voices/*.bin       the voice styles (~0.5 MB each)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Keep in sync with KOKORO_VOICES in src/lib/ai/speech.ts. */
const VOICES = [
  'af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_nova', 'af_alloy',
  'am_michael', 'am_fenrir', 'am_puck',
  'bf_emma', 'bf_isabella', 'bm_george', 'bm_fable',
];

await build({
  entryPoints: [path.join(root, 'electron/voice-worker.cjs')],
  outfile: path.join(root, 'electron/voice/worker.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // the native runtime ships as files (see "asarUnpack" in package.json)
  external: ['onnxruntime-node', 'electron'],
  // transformers.js pulls in sharp for images; a voice never needs it
  alias: { sharp: path.join(root, 'scripts/sharp-stub.cjs') },
  logLevel: 'warning',
  legalComments: 'eof',
});

const voicesOut = path.join(root, 'electron/voices');
fs.rmSync(voicesOut, { recursive: true, force: true });
fs.mkdirSync(voicesOut, { recursive: true });
for (const v of VOICES) fs.copyFileSync(path.join(root, 'node_modules/kokoro-js/voices', `${v}.bin`), path.join(voicesOut, `${v}.bin`));
console.log(`voice worker bundled; ${VOICES.length} voices copied`);
