# Credits

## Hand photographs (`src/assets/hands/`)

Cut out, re-oriented and shadowed from photos published under the
[Unsplash License](https://unsplash.com/license) (free for commercial and
non-commercial use, no attribution required — given here anyway). The sleeve that
extends each arm off-screen is drawn by the app.

- `marker.webp` — https://unsplash.com/photos/PxxAXP1hVh8
- `pen.webp` — https://unsplash.com/photos/a-persons-hand-holding-a-pen-over-a-piece-of-paper-w289n_ihXkI
- `chalk.webp` — https://unsplash.com/photos/person-holding-black-and-white-pen-Nlax2tu89bU

## Illustration library (`public/library/`)

Built by `node scripts/library/build.mjs` (sources in `scripts/library/sources.mjs`),
which downloads each pack, converts every picture to plain SVG shapes and writes
`index.json`.

- `openmoji/`, `openmoji-color/` — [OpenMoji](https://openmoji.org) glyphs (black and
  colour), © OpenMoji contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `doodles/` — [Open Doodles](https://www.opendoodles.com) by Pablo Stanley, CC0;
  SVG sources recovered from [lunahq/react-open-doodles](https://github.com/lunahq/react-open-doodles) (MIT).
- `openpeeps/` — [Open Peeps](https://www.openpeeps.com) by Pablo Stanley, CC0; people
  assembled from the parts in [jenshor/open-peeps](https://github.com/jenshor/open-peeps) (MIT).
- `tabler/` — [Tabler Icons](https://tabler.io/icons) by Paweł Kuna, MIT.
- `healthicons/` — [Health Icons](https://healthicons.org), MIT (icons released under CC0).
- `flowbite/` — [Flowbite Illustrations](https://flowbite.com/illustrations/) by Themesberg, MIT.
- `illlustrations/` — [illlustrations.co](https://illlustrations.co) by Vijay Verma, MIT.
- `megadoodles/` — [Mega Doodles Pack](https://github.com/MariaLetta/mega-doodles-pack) by
  Maria Letta, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

CC BY-SA artwork (OpenMoji, Mega Doodles) keeps its licence when it appears in a
video; the others need no attribution.

## Fonts (`src/assets/fonts/`, Inter also in `public/fonts/` for the UI)

- Caveat, Shadows Into Light, Inter — SIL Open Font License, via Google Fonts.

## Icons (Shapes panel)

Outline icons adapted from / in the style of [Lucide](https://lucide.dev) (ISC).

## Built-in offline voice (desktop app)

`electron/voice-worker.cjs`, bundled by `scripts/build-voice-worker.mjs` into
`electron/voice/worker.cjs`, with 15 voice styles copied to `electron/voices/`.

- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad — Apache-2.0.
  The model (ONNX export by [onnx-community](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX),
  about 92 MB) is downloaded on first use, not shipped.
- [kokoro-js](https://github.com/hexgrad/kokoro) — Apache-2.0.
- [Transformers.js](https://github.com/huggingface/transformers.js) — Apache-2.0.
- [ONNX Runtime](https://github.com/microsoft/onnxruntime) (`onnxruntime-node`) — MIT.
- [phonemizer.js](https://github.com/xenova/phonemizer.js) — Apache-2.0; it contains
  [eSpeak NG](https://github.com/espeak-ng/espeak-ng) compiled to WebAssembly, which is
  licensed **GPL-3.0-or-later**. Its source is available at that link.
