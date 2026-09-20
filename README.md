# DrawFlow — Whiteboard Animation Studio

An open-source, local-first whiteboard animation tool in the spirit of VideoScribe.
Add text, shapes, pictures and characters; a photographed (or cartoon) hand draws
each one while the camera glides from shot to shot; add music, a voiceover or AI
narration; export MP4/WebM/GIF entirely on your machine — in the browser, as a
Windows desktop app, or from the command line.

No account, no upload, no tracking. Projects live in your browser (or in
`.drawflow.json` files you keep wherever you like).

## Run it

```bash
npm install
npm run dev              # editor at http://localhost:5173
npm run build            # production build in dist/
npm run desktop:pack     # Windows installer (Electron) in release/
npm test                 # end-to-end tests (uses the Chrome/Edge on your machine)
```

Video export needs a cross-origin-isolated page only when the browser has no
built-in video encoder; the dev/preview servers and the desktop app send the
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers anyway
(`public/_headers` covers Netlify-style hosts).

## What it does

**Canvas** — an infinite sheet of paper. Drag empty paper to pan (hand cursor),
wheel to zoom, snap to a grid, rulers, smart alignment guides, multi-select
(shift-click / shift-drag), copy/paste, group/ungroup, lock, hide, opacity, flip,
rotate, image crop and replace, align/distribute, stacking layers, a Layers panel.

**Drawing** — SVG artwork is drawn stroke by stroke by the hand; photos are
revealed with a scribble, a wipe, a radial or a centre-out reveal. Text is
converted to glyph outlines so it is genuinely hand-written (bold, italic,
alignment, spacing, right-to-left, your own TTF/OTF fonts). Stroke order can be
changed (left→right, top→bottom, centre out…). Hands: marker, pen and chalk
photographs with a sleeve that runs off the board, three flat cartoon hands
(pencil, brush, eraser), or your own photo with a click-to-set pen tip.

**Animation** — entrances (draw, slide, wipe, fade, scale, pop, bounce,
typewriter, appear), emphasis after drawing (pulse, shake, bounce, spin, grow,
highlight, repeatable), exits (fade, slide, wipe, shrink, erase with the hand,
reverse draw), easing, "start together with the previous element", copy/paste
of animation settings.

**Timeline** — a real time axis: ruler with markers, an element track where you
drag edges to retime and blocks to reorder, three audio lanes (music, voice,
sound effects), Ctrl+wheel zoom, snapping to markers/clips/elements/seconds, and
the VideoScribe-style film strip. Scenes group elements with cut/fade/wipe
transitions, per-scene paper, clear-the-board, scene camera, reorder,
duplicate, and single-scene export.

**Camera** — the dashed boundary in Edit view is what the video captures.
Elements you add share that shot until you pan away; per element choose Stay /
This shot / Zoom to it / Scene / All, or drag the frame by hand. Ease-out,
linear or cut moves.

**Audio** — import MP3/WAV/M4A/OGG, record a voiceover while the scribe plays,
split/trim/move, volume, fades, mute, solo, normalise, background-noise
clean-up, twelve built-in synthesised sound effects, AI narration (OpenAI, Groq,
Gemini TTS with your key), and *fit to narration*: retime elements to the
phrases of the voiceover from silence detection (offline) or Whisper sentence
timestamps.

**Export** — MP4 (H.264 + AAC) and WebM (VP9 + Opus) through the browser's own
encoders, several encoders in parallel; 720p to 4K or any height; GIF, PNG
frame sequences and single-frame snapshots; cancel any time. A 27-second 1080p
clip renders in roughly real time on a two-core laptop and faster with more
cores. ffmpeg.wasm is only used on browsers without WebCodecs.

**Projects** — every project is checkpointed to the browser a moment after each
change, with thumbnails, a projects dialog (Ctrl+O), version history with
restore, seven starter templates, "save as template" for projects and scenes,
and portable `.drawflow.json` files ([schema](./schema/drawflow.schema.json)).
Files are validated and repaired on open.

**AI (bring your own key)** — Anthropic, OpenAI, Groq or Gemini keys stay in the
browser. Describe a scene and get library pictures, text and hand-drawn SVG;
turn a photo into a doodle offline or into a cartoon with an image model; write a
script and get a whole multi-scene scribe with optional narration.

**Desktop** — the same app inside Electron with a Windows installer.

## Command line

```bash
npm run build
npx drawflow render examples/explainer.drawflow.json            # → explainer.mp4
npx drawflow render *.drawflow.json --format webm --height 720 -o out/
npx drawflow render talk.drawflow.json --scene "The result"
npx drawflow validate my.drawflow.json
npx drawflow preview my.drawflow.json
npx drawflow bench                                              # paint/encode speed
npx drawflow examples                                           # write the templates as files
```

The CLI serves the built app and drives headless Chrome/Edge through the same
`window.DrawFlow` API the editor uses, so it renders exactly what the Export
button renders. See [docs/cli.md](./docs/cli.md).

## Extending it

- **Scripting API** — `window.DrawFlow` exposes the store, `loadProject`,
  `saveProject`, `render`, `newFromTemplate`, `addText` and more
  ([docs/api.md](./docs/api.md)).
- **Plugins** — ES modules that register entrance/emphasis/exit effects, asset
  providers, exporters or panels; install from a URL or paste code under
  *View → Plugins* ([docs/plugins.md](./docs/plugins.md)).
- **Project format** — human-readable JSON with everything embedded
  ([docs/project-format.md](./docs/project-format.md), [JSON Schema](./schema/drawflow.schema.json)).
- **Architecture** — [docs/architecture.md](./docs/architecture.md).
- **Feature checklist** — [checklist.md](./checklist.md) tracks what is done.

## Shortcuts

Press `?` in the app for the full list. The essentials: `Space` play/pause ·
`Ctrl+Z`/`Ctrl+Shift+Z` undo/redo · `Ctrl+C/X/V` · `Ctrl+D` duplicate · `Ctrl+A`
select all · arrows nudge · `Ctrl+G` group · `[`/`]` stacking · `M` marker ·
`S` split clip · `F` frame selection · `Shift+F` full-screen preview ·
`Ctrl+K` command palette · `Ctrl+O` projects · `Ctrl+E` export.

Asset licences are listed in [CREDITS.md](./CREDITS.md).
