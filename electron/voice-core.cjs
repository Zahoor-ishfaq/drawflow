// The built-in offline voice engine: Kokoro-82M (Apache-2.0) run natively
// with onnxruntime-node. Shared by the desktop app's voice worker
// (voice-worker.cjs) and the MCP server (mcp/server.mjs). The model (~92 MB)
// is downloaded once, on first use, into `modelsDir`.
const { env } = require('@huggingface/transformers');
const { KokoroTTS } = require('kokoro-js');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Relative to the models folder: present once the model has been downloaded. */
const MODEL_FILE = 'onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx';

/**
 * One engine per process. `onProgress(loaded, total)` sees the one-time
 * model download, in whole percents.
 */
function createVoice({ modelsDir, onProgress = () => {} }) {
  env.cacheDir = modelsDir;
  env.allowLocalModels = false;
  let loading = null;

  function model() {
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
  return {
    /** Speak `text` with `voice`; resolves with a WAV file's bytes. One take at a time. */
    speak(text, voice, speed = 1) {
      // the CPU is the bottleneck: running two takes at once is slower for both
      const run = queue.then(async () => {
        const tts = await model();
        const audio = await tts.generate(text, { voice, speed });
        return new Uint8Array(audio.toWav());
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

module.exports = { createVoice, MODEL_FILE };
