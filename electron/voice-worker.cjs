// The built-in offline voice in the desktop app (engine: voice-core.cjs). It
// lives in an Electron utility process so a long take never stalls the
// window. The model is downloaded once, on first use, into the folder the
// main process passes in DRAWFLOW_MODELS.
//
// Messages from the main process: { id, type: 'speak', text, voice, speed }.
// Replies: { id, type: 'progress', loaded, total } while the model downloads,
// then { id, type: 'done', wav } or { id, type: 'error', message }.
//
// Packaged builds run scripts/build-voice-worker.mjs's single-file bundle of
// this script; in development it runs as is, straight from node_modules.
const { createVoice } = require('./voice-core.cjs');

// progress goes to whichever request is waiting on the download
let progressTo = null;
const voice = createVoice({
  modelsDir: process.env.DRAWFLOW_MODELS,
  onProgress: (loaded, total) => progressTo?.({ type: 'progress', loaded, total }),
});

process.parentPort.on('message', async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'speak') return;
  const post = (reply) => process.parentPort.postMessage({ id: msg.id, ...reply });
  progressTo = post;
  try {
    post({ type: 'done', wav: await voice.speak(msg.text, msg.voice, msg.speed ?? 1) });
  } catch (e) {
    post({ type: 'error', message: e && e.message ? e.message : String(e) });
  }
});
