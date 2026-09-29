// The built-in offline voice: Kokoro-82M (Apache-2.0) run natively with
// onnxruntime-node. It lives in an Electron utility process so a long take
// never stalls the window. The model (~92 MB) is downloaded once, on first
// use, into the folder the main process passes in DRAWFLOW_MODELS.
//
// Messages from the main process: { id, type: 'speak', text, voice, speed }.
// Replies: { id, type: 'progress', loaded, total } while the model downloads,
// then { id, type: 'done', wav } or { id, type: 'error', message }.
//
// Packaged builds run scripts/build-voice-worker.mjs's single-file bundle of
// this script; in development it runs as is, straight from node_modules.
const { env } = require('@huggingface/transformers');
const { KokoroTTS } = require('kokoro-js');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
env.cacheDir = process.env.DRAWFLOW_MODELS;
env.allowLocalModels = false;

let loading = null;

/** Load the model once; `onProgress` sees the one-time download. */
function model(onProgress) {
  if (!loading) {
    let lastPercent = -1;
    loading = KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p) => {
        // only the model file counts: the small config files come first and would read as "100 %"
        if (p.status !== 'progress' || !p.total || !/\.onnx$/.test(p.file)) return;
        // whole percents only — the download reports every few kilobytes
        const percent = Math.floor((100 * p.loaded) / p.total);
        if (percent !== lastPercent) { lastPercent = percent; onProgress(p.loaded, p.total); }
      },
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

let queue = Promise.resolve();

process.parentPort.on('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'speak') return;
  const post = (reply) => process.parentPort.postMessage({ id: msg.id, ...reply });
  // one take at a time: the CPU is the bottleneck, running two at once is slower for both
  queue = queue.then(async () => {
    try {
      const tts = await model((loaded, total) => post({ type: 'progress', loaded, total }));
      const audio = await tts.generate(msg.text, { voice: msg.voice, speed: msg.speed ?? 1 });
      post({ type: 'done', wav: new Uint8Array(audio.toWav()) });
    } catch (e) {
      post({ type: 'error', message: e && e.message ? e.message : String(e) });
    }
  });
});
