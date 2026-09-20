# Architecture

DrawFlow is a Vite + React + TypeScript app with a Zustand store. The one idea
that shapes everything: **the picture is a pure function of time.** Given the
project and a time `t`, `src/lib/renderFrame.ts` says what is on screen —
which elements, how far each is drawn, where the camera is, where the hand is,
which scene transition is running. The live canvas, the export pipeline, the
thumbnails and the CLI all call the same function, so preview and video never
disagree.

```
src/
  types.ts                 the document model (Project, DrawElement, AudioClip, Scene…)
  store/useStore.ts        document state + actions, undo history (zundo)
  store/uiStore.ts         editor preferences (theme, snapping, panel sizes)
  lib/renderFrame.ts       time → frame math (entrances, emphasis, exits, camera, scenes, hand)
  lib/camera.ts            shots, auto-framing, camera timeline
  lib/timing.ts            slot / emphasis / exit windows
  lib/drawing.ts           SVG path measurement (lengths, bboxes), dash-reveal math
  lib/canvasRender.ts      Canvas2D painter (export) — twin of the SVG serializer
  lib/parallelRender.ts    paints frames and feeds several encoders in parallel
  lib/mediaEncoder.ts      WebCodecs H.264/VP9 + AAC/Opus into mp4-muxer / webm-muxer
  lib/exportVideo.ts       export orchestration, GIF / PNG paths, ffmpeg.wasm fallback
  lib/audioEngine.ts       Web Audio playback; audioMix.ts offline mixdown
  lib/audioTools.ts        normalise, noise gate, speech segmentation, synthesised SFX
  lib/narration.ts         fit elements to narration phrases
  lib/textToPaths.ts       opentype.js text → glyph paths (bold/italic/RTL/custom fonts)
  lib/persistence.ts       IndexedDB projects, versions, templates; .drawflow.json files
  lib/validate.ts          tolerant document validation
  lib/plugins.ts           plugin registry; lib/api.ts the window.DrawFlow surface
  lib/ai/*                 BYOK providers (chat, images, speech), planner, offline sketcher
  assets/                  hands (photos + cartoon SVG), paper styles, shapes, templates, library index
  components/              React UI: canvas, timeline, inspector, library panels, dialogs
cli/drawflow.mjs           command line (serves dist/, drives headless Chrome)
electron/                  desktop shell
tests/                     Playwright end-to-end tests
schema/                    JSON Schema for project files
```

## The sequential model

Elements play one after another (VideoScribe's model). `rechain()` in the
store derives every `startTime` from the order: slot = draw → emphasis →
pause, the next element starts after the slot plus its own transition;
`withPrevious` starts elements together. Exits run after the slot and may
overlap later elements. Because timing is derived, reordering is just
renumbering `zIndex`; stacking adds an optional `layer` offset.

## Camera

Each element has a shot (`camera`): the previous shot, an explicit view, an
auto-framed zoom, its scene, or everything. `buildCameraTimeline` turns that
into keyframes the camera eases between during each element's transition. In
Edit view the on-screen boundary *is* the current shot: new elements share it
until the user pans away.

## Rendering paths

- **Live canvas** — `Stage.tsx` renders SVG; each element's markup comes from
  `elementInnerSvg`, the same string the export serializer uses.
- **Export** — `parallelRender.ts` paints frames with the Canvas2D painter
  (`canvasRender.ts`, Path2D + compositing masks) and pushes them through N
  `VideoEncoder`s, one per physical core, each encoding a contiguous segment;
  chunks are muxed in order. Audio is mixed offline with `OfflineAudioContext`
  and encoded with `AudioEncoder`. Browsers without WebCodecs fall back to
  JPEG frames + ffmpeg.wasm.
- **Thumbnails / snapshots** — the SVG serializer rasterised through `<img>`.

Path measurement (`getTotalLength`, `getBBox`) needs a DOM; `drawing.ts` has
an injectable provider so the pure math can run elsewhere later.

## Persistence

One IndexedDB database (`lib/db.ts`): `projects` (each with embedded audio and
a thumbnail), `versions` (periodic snapshots), `templates`, `gallery`
(uploads). Autosave debounces changes by 1.5 s; the top-bar status reflects it.

## Testing

`npm test` runs Playwright against `vite preview` in the system Chrome/Edge:
editor behaviour, exports (real MP4/WebM/GIF bytes are checked), projects and
validation. `npx drawflow bench` reports paint and encode throughput.
