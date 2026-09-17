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
- **Audio editing.** Two lanes under the scrub bar — Music and Voiceover. Drag a clip to
  move it, drag its ends to trim, click it for volume, fade in/out, mute, duplicate and
  delete; press `S` (or the button) to split it at the playhead. Drop an audio file on
  the lane to add it where you drop it.
- **Voiceover.** Press *Record*: the scribe plays from the playhead while you narrate; stop
  (or let it finish) and the take lands on the Voiceover lane at the right time.
- **Checkpoints.** Every change is saved to this browser's local storage a moment later
  and restored when you come back (see the status in the top bar). *Save to file / Open
  file* in that menu gives you a portable `.drawflow.json` backup; *New project* starts over.
- **Elements play in sequence.** Each has three times, exactly like VideoScribe:
  **Animate** (seconds to draw), **Pause** (hold after drawing) and **Transition**
  (camera travel into it). Start times are derived automatically.
- **Camera = the boundary on screen.** The dashed boundary in Edit view is what the
  video captures. Add elements and they land inside it and share that shot — each is
  drawn in turn while the others stay visible. Drag the paper to fresh space and add
  something there to start a new shot; the camera only moves between shots. Per element
  you can still choose *Stay*, *This shot*, *Zoom to it* or *All*, and drag/resize the
  teal frame to set a shot by hand. The video ends on the last shot (a pull-back to show
  everything is an opt-in project setting). Camera movement is *Ease out*, *Linear* or a hard *Cut* (project setting).
- **Infinite canvas.** In Edit view the paper is endless: hover empty paper and the
  cursor becomes a hand — drag to pan, wheel to zoom, place elements anywhere. The dashed
  "video frame" is only a guide; the camera visits each element wherever it is. *Fit*
  frames everything you've placed.
- **Edit view / Camera view** above the canvas: edit the paper, or see exactly what the
  video will show at the current time. Scrubbing and Preview switch to camera view
  automatically; a dashed guide shows the selected element's framing.
- **Strip (bottom)** — thumbnails in play order. Click a card to go to that element
  (the paper glides to its camera frame), drag to reorder, and use the small play
  button on a card to play from that element. Cards show animate and pause times;
  connectors show transitions.
- **Camera frame per element.** The dashed frame on the canvas is what that shot
  captures: drag it to move, drag its corners to capture more or less (so several
  elements can share one shot — set the later ones to *Stay*). Project settings has an
  auto-framing slider for how much of the frame an element fills by default.
- **Inspector (right)** — *Animation* tab (timing, entrance style, per-element hand,
  camera) and *Style* tab (position, colours, stroke, text content and font).
- **Export** — MP4 (H.264) or WebM (VP9) at 720p/1080p via ffmpeg.wasm. Frames are
  rendered deterministically, so the file always matches the preview.

## Shortcuts

`Space` play/pause · `←/→` step one frame · `Delete` remove selection ·
`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Ctrl+D` duplicate · `S` split audio clip at playhead · `Esc` deselect

Asset licences are listed in [CREDITS.md](./CREDITS.md).
