# DrawFlow — Whiteboard Animation Studio

A browser-based whiteboard animation tool in the spirit of VideoScribe, built from
[drawflow_specs.md](./drawflow_specs.md). Add text, shapes and images; a real
photographed hand draws each one while the camera glides from element to element;
export the result to MP4/WebM entirely in the browser.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run build` + `npm run preview` for a production build; `npm run desktop:dev` /
`desktop:pack` for the Electron desktop app. Video export needs the page to be
cross-origin isolated — the dev and preview servers already send the required
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers, and
`public/_headers` covers Netlify-style hosts.

## How it works (the VideoScribe model)

- **Toolbar (left)** — *Images* (your persistent uploads — PNG, JPG, WebP, GIF or
  SVG — plus a 1,400-piece illustration library with search and categories), *Text*
  (handwritten fonts, drawn letter by letter), *Shapes & icons*, *Music*, and the two
  project settings: *Hand* (marker / pen / chalk — real photographs whose sleeve always
  runs off the board) and *Paper* (plain, grid, dots, lined, cream, kraft, chalkboard).
- **Edit view** shows the finished scribe with no hand; the hand only appears in
  *Camera view* and when you press Preview.
- **Entrance effects** for every element: *Draw* (photos get a scribble reveal),
  *Slide in* from any side, *Fade*, *Appear*.
- **Music** sits on a lane under the scrub bar: drag the clip to move it, drag its ends
  to cut it, click it to set volume and timing.
- **Elements play in sequence.** Each has three times, exactly like VideoScribe:
  **Animate** (seconds to draw), **Pause** (hold after drawing) and **Transition**
  (camera travel into it). Start times are derived automatically.
- **Camera.** By default the camera zooms to each element as it's drawn, then pulls
  back to the whole scribe at the end. Per element you can choose *Zoom to it*,
  *Stay* (keep the previous framing) or *Whole* canvas, and tune the zoom tightness.
  Camera movement is *Ease out*, *Linear* or a hard *Cut* (project setting).
- **Infinite canvas.** In Edit view the paper is endless: hover empty paper and the
  cursor becomes a hand — drag to pan, wheel to zoom, place elements anywhere. The dashed
  "video frame" is only a guide; the camera visits each element wherever it is. *Fit*
  frames everything you've placed.
- **Edit view / Camera view** above the canvas: edit the paper, or see exactly what the
  video will show at the current time. Scrubbing and Preview switch to camera view
  automatically; a dashed guide shows the selected element's framing.
- **Strip (bottom)** — thumbnails in play order. Drag to reorder, double-click to
  jump there. Each card shows its animate and pause times; connectors show transitions.
- **Inspector (right)** — *Animation* tab (timing, entrance style, per-element hand,
  camera) and *Style* tab (position, colours, stroke, text content and font).
- **Export** — MP4 (H.264) or WebM (VP9) at 720p/1080p via ffmpeg.wasm. Frames are
  rendered deterministically, so the file always matches the preview.

## Shortcuts

`Space` play/pause · `←/→` step one frame · `Delete` remove selection ·
`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Ctrl+D` duplicate · `Esc` deselect

Asset licences are listed in [CREDITS.md](./CREDITS.md).
