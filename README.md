# DrawFlow — Whiteboard Animation Studio

A browser-based whiteboard/hand-drawn animation tool (a VideoScribe alternative), built
from [drawflow_specs.md](./drawflow_specs.md). Compose scenes from text, shapes, and
imported SVGs; each element draws itself on the canvas as an animated hand traces it,
synced to a timeline and audio, then exports to MP4/WebM entirely in the browser.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` + `npm run preview` for a production build. Both the dev and preview
servers send the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers
that video export requires; any production host must send the same two headers over
HTTPS (a Netlify `_headers` file is included in `public/`).

## Quick tour

- **Left rail — Add**: text (Caveat/Inter, converted to glyph paths via opentype.js),
  eight built-in shapes, and an SVG import dropzone. **Library**: 24 bundled outline
  illustrations, searchable.
- **Canvas**: click to select, drag to move, corner handles to scale. Scroll wheel
  zooms, middle-drag pans.
- **Timeline**: one track per element (top = top layer). Drag a clip to change its
  start time, drag its right edge to change draw duration, drag vertically to reorder
  layers. Ruler click/drag seeks; the audio lane at the bottom takes a soundtrack and
  renders its waveform.
- **Inspector**: transform, style (stroke/fill/width, fill-after-draw), animation
  (Draw/Appear/Fade, duration, start, hand style), and text editing. With nothing
  selected it shows project settings (canvas preset, fps, background).
- **Export**: MP4 (H.264) or WebM (VP9) at 720p/1080p via ffmpeg.wasm — deterministic
  frame-by-frame capture, so the file always matches the preview. Expect 1–3 minutes
  for a 20–30 s clip at 1080p.

## Shortcuts

`Space` play/pause · `←/→` step one frame · `Delete` remove selection ·
`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Ctrl+D` duplicate · `Esc` deselect
