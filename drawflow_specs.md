# DrawFlow — Whiteboard Animation Studio

> A browser-based whiteboard/hand-drawn animation tool (a VideoScribe alternative).
> Users compose scenes from text, shapes, and imported SVGs; each element "draws itself"
> on a canvas as an animated hand traces it, synced to a timeline and audio, then exports to video.

**This document is a complete build specification. Hand it to Claude Code and build it section by section, top to bottom.**

---

## 0. How to use this file with Claude Code

Build in the phase order in Section 12. After each phase, run the app and verify the "Acceptance check" for that phase before moving on. Do **not** try to build every phase in one shot — scaffold first, get the core draw effect working on screen, then layer the rest. Commit after each passing phase.

---

## 1. Product summary

DrawFlow lets a user:

1. Add elements to a canvas — typed text, built-in shapes, or uploaded SVG files.
2. See each element **drawn on** by an animated hand, stroke by stroke.
3. Arrange elements on a **timeline** — set when each starts, how long it draws, and layer order.
4. Add a soundtrack and preview everything in sync.
5. **Export** the finished animation to MP4 / WebM entirely in the browser (no server).

The whole app runs client-side. There is no required backend for the MVP.

---

## 2. Tech stack (pinned)

| Concern | Choice | Notes |
|---|---|---|
| Build tool | **Vite** (latest) | Fast, first-class WASM + worker support |
| Language | **TypeScript** (strict mode on) | |
| UI framework | **React 18+** | |
| State | **Zustand** + `zundo` (temporal middleware) | Store + undo/redo |
| Styling | **Tailwind CSS** + CSS variables for theming | See Section 9 for the design system |
| Icons | **lucide-react** | Thin, consistent, non-generic |
| Text → paths | **opentype.js** | `font.getPath(text, x, y, size)` → SVG path data |
| Drawing math | Native SVG `getTotalLength()` / `getPointAtLength()` | No animation lib needed for core; GSAP optional |
| Audio | **Web Audio API** + **wavesurfer.js** for the waveform | |
| Video export | **@ffmpeg/ffmpeg** `0.12.10` + **@ffmpeg/util** | Runs in-browser via WASM |
| Frame capture | Manual seek + `OffscreenCanvas` (see Section 8) | Deterministic, not real-time recording |

Install:

```bash
npm create vite@latest drawflow -- --template react-ts
cd drawflow
npm i zustand zundo opentype.js wavesurfer.js lucide-react
npm i @ffmpeg/ffmpeg@0.12.10 @ffmpeg/util
npm i -D tailwindcss @tailwindcss/vite
```

---

## 3. Critical environment requirement (do this first — it blocks export)

`ffmpeg.wasm` needs `SharedArrayBuffer`, which the browser only exposes when the page is
**cross-origin isolated**. The dev server and any production host **must** send these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // ffmpeg ships ESM that Vite shouldn't pre-bundle
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
```

For production, the same two headers must be set at the host (Netlify `_headers`, Vercel
`vercel.json`, or an Nginx/Cloudflare rule). Also serve over **HTTPS** — multi-threaded
ffmpeg won't run otherwise. If these headers are missing, `SharedArrayBuffer` is `undefined`
and export silently fails; surface a clear error in the UI in that case.

---

## 4. The core drawing technique (the heart of the app)

Every drawable element is reduced to one or more **SVG paths**. The "self-drawing" illusion
is the classic dash trick:

```ts
// For a single <path> element:
const length = pathEl.getTotalLength();
pathEl.style.strokeDasharray = `${length}`;
pathEl.style.strokeDashoffset = `${length}`;   // fully hidden

// progress goes 0 → 1 over the element's drawDuration
function setProgress(p: number) {
  pathEl.style.strokeDashoffset = `${length * (1 - p)}`;  // reveals the stroke
}
```

The hand follows the tip of whatever is currently being drawn:

```ts
const tip = pathEl.getPointAtLength(length * p);
handEl.style.transform = `translate(${tip.x}px, ${tip.y}px) rotate(${angle}deg)`;
```

To make the hand angle look natural, sample a point slightly behind the tip and take the
direction between them:

```ts
const back = pathEl.getPointAtLength(Math.max(0, length * p - 2));
const angle = Math.atan2(tip.y - back.y, tip.x - back.x) * (180 / Math.PI);
```

### Elements with multiple paths (text, complex SVGs)

Text and most SVGs are many paths (one per glyph, or per stroke). Draw them **sequentially**:
compute each sub-path length, sum to a total, then within the element's `drawDuration` walk a
cursor across the concatenated length — reveal completed sub-paths fully, partially reveal the
active one, keep upcoming ones hidden. The hand sits on the active sub-path.

Keep a small helper module `lib/drawing.ts` exporting:
- `measurePaths(paths: SVGPathElement[]): { lengths: number[]; total: number }`
- `applyDrawProgress(paths, lengths, total, progress)` → sets dasharray/offset on each
- `handTransformAt(paths, lengths, total, progress)` → returns `{ x, y, angle }` for the hand

### Fill after stroke (optional polish)

Real whiteboard tools stroke the outline, then flood the fill. For MVP, after `progress`
reaches 1 for an element, transition its `fill-opacity` from 0 → 1 over ~200ms so colored
shapes/letters "fill in" once drawn. Gate this behind a per-element `fillAfterDraw` boolean.

### Draw styles

Each element has a `style`:
- `draw` — the dash animation above (default).
- `appear` — snaps visible at `startTime` (no hand).
- `fade` — opacity 0 → 1 over `drawDuration` (no hand).

---

## 5. Data model (Zustand store)

```ts
type DrawStyle = 'draw' | 'appear' | 'fade';
type HandStyle = 'marker' | 'pencil' | 'chalk' | 'none';
type ElementKind = 'text' | 'shape' | 'svg' | 'image';

interface DrawElement {
  id: string;
  kind: ElementKind;
  label: string;              // shown on the timeline clip
  paths: string[];            // SVG path 'd' strings, already positioned
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  fillAfterDraw: boolean;

  // transform (applied via a wrapping <g transform=...>)
  x: number;
  y: number;
  scale: number;
  rotation: number;

  // timeline
  startTime: number;          // seconds from timeline zero
  drawDuration: number;       // seconds to draw this element
  style: DrawStyle;
  zIndex: number;             // stacking + timeline row

  // text-only metadata (for re-editing)
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

interface AudioTrack {
  id: string;
  name: string;
  buffer: AudioBuffer | null; // decoded, for waveform + playback
  url: string;                // object URL of the uploaded file
  startTime: number;
  volume: number;             // 0..1
}

interface Project {
  name: string;
  width: number;              // canvas px, default 1920
  height: number;             // default 1080
  fps: number;                // default 30
  background: string;         // default '#ffffff'
  duration: number;           // total timeline length, seconds (auto-grows)
}

interface AppState {
  project: Project;
  elements: DrawElement[];
  audio: AudioTrack | null;

  // playback
  currentTime: number;
  isPlaying: boolean;

  // editing
  selectedId: string | null;
  handStyle: HandStyle;

  // export
  isExporting: boolean;
  exportProgress: number;     // 0..1
  ffmpegReady: boolean;

  // actions (implement all of these)
  addElement(partial: Partial<DrawElement> & Pick<DrawElement,'kind'|'paths'>): void;
  updateElement(id: string, patch: Partial<DrawElement>): void;
  removeElement(id: string): void;
  reorder(id: string, newZIndex: number): void;
  select(id: string | null): void;
  setTime(t: number): void;
  play(): void; pause(): void; stop(): void;
  setAudio(track: AudioTrack | null): void;
  setHandStyle(s: HandStyle): void;
}
```

Wrap the store in `zundo`'s `temporal` middleware so `undo()` / `redo()` work. Only track
`elements`, `audio`, and `project` in history — **not** `currentTime`, `isPlaying`, or
`exportProgress` (exclude those via zundo's `partialize`), or every scrub becomes an undo step.

`project.duration` should auto-recompute as `max(startTime + drawDuration)` across elements,
plus a small tail, whenever elements change.

---

## 6. The playback clock

One master clock drives everything. Use `requestAnimationFrame`, not `setInterval`.

```ts
// hooks/usePlaybackClock.ts — sketch
let raf = 0;
let clockStart = 0;         // performance.now() when play began
let offset = 0;             // currentTime when play began

function play() {
  clockStart = performance.now();
  offset = get().currentTime;
  audio?.play(offset);      // start Web Audio source at the right position
  const tick = (now: number) => {
    const t = offset + (now - clockStart) / 1000;
    if (t >= project.duration) { stop(); return; }
    setTime(t);             // store update → canvas re-derives what's visible
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
```

The canvas is a **pure function of `currentTime`**: given `t`, for each element compute its
local progress `p = clamp((t - startTime) / drawDuration, 0, 1)` and render accordingly. This
purity is what makes both scrubbing and frame-accurate export work (Section 8).

---

## 7. Rendering the canvas

- Root is a single `<svg viewBox="0 0 {width} {height}">` scaled to fit its container with
  `width:100%; height:auto`.
- One `<g>` per element, ordered by `zIndex`, with `transform="translate(x y) rotate(rot) scale(s)"`.
- Inside each `<g>`, one `<path>` per entry in `element.paths`.
- The hand is a separate absolutely-positioned `<img>` (or inline `<svg>`) layered above,
  positioned from `handTransformAt(...)` of whichever element is actively drawing at `t`.
  Only one hand is visible at a time — the topmost element whose `0 < p < 1`. Hide it when
  nothing is actively drawing or `handStyle === 'none'`.
- Selection: when `selectedId` matches, draw a dashed bounding box + 8 resize handles around
  the element's bbox (use `getBBox()` on the group).
- Interactions on the canvas:
  - Click element → select.
  - Drag element → update `x`/`y`.
  - Drag a corner handle → update `scale`.
  - Scroll wheel → zoom the viewport (not the element); middle-drag or space-drag → pan.
    Keep zoom/pan as **view state**, separate from element transforms.

Keep the SVG approach for MVP. If profiling later shows too many paths (thousands), add an
optional Canvas2D renderer that walks `Path2D` objects with `setLineDash`, but don't
pre-optimize — SVG is fine for typical decks.

---

## 8. Export pipeline (deterministic, frame-by-frame)

**Do not screen-record.** Real-time capture drops frames and desyncs. Instead, render each
frame deterministically by seeking the clock:

1. Compute `totalFrames = ceil(duration * fps)`.
2. For `frame = 0 … totalFrames-1`:
   a. `t = frame / fps`
   b. Set the canvas to exactly time `t` (reuse the same pure render used for preview).
   c. Serialize the live SVG to a string, draw it to an `OffscreenCanvas` of size
      `width × height` via an `Image` + `drawImage`, then `convertToBlob({type:'image/png'})`.
   d. Write the PNG into ffmpeg's virtual FS as `frame_00001.png` (zero-padded).
   e. Update `exportProgress = frame / totalFrames` so the UI bar moves.
   f. `await` a microtask/`requestAnimationFrame` every N frames so the UI stays responsive.
3. Encode:

```ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();
const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
await ffmpeg.load({
  coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
  wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
});
// after all frames written:
await ffmpeg.exec([
  '-framerate', String(fps),
  '-i', 'frame_%05d.png',
  '-i', 'audio.mp3',                 // only if an audio track exists
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '20',
  '-pix_fmt', 'yuv420p',             // required for broad player compatibility
  '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2',  // ffmpeg needs even dimensions
  '-shortest',
  'out.mp4',
]);
const data = await ffmpeg.readFile('out.mp4');
const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
// trigger download
```

Notes and gotchas to bake in:
- **WebM path** is faster and needs no libx264 re-mux; offer both formats. For WebM use
  `-c:v libvpx-vp9`. Default the UI to MP4.
- Expect encoding to be slow: a 20–30s 1080p clip can take **1–3 minutes** in-browser. Show a
  determinate progress bar (frame capture) followed by an indeterminate "Encoding…" state
  (ffmpeg's own progress via `ffmpeg.on('progress', ...)`).
- Load ffmpeg **lazily** on first export, not at app start (it's multi-MB). Cache it after.
- Free object URLs and clear the ffmpeg FS (`ffmpeg.deleteFile`) after export to avoid leaks.
- If `crossOriginIsolated === false`, don't even start — show the header-setup error.
- Offer resolution presets (720p / 1080p) — capturing at 720p roughly quarters export time.

---

## 9. UI / visual design — "professional, not AI-looking"

This is a priority. The default "AI app" look (big rounded purple gradient cards, emoji,
centered hero, glassmorphism, three equal feature cards) is explicitly **banned**. Aim for a
tool that looks like Figma / DaVinci Resolve / Descript — dense, quiet, confident.

### Layout (desktop-first, min 1280px)

```
┌───────────────────────────────────────────────────────────────┐
│  Top bar  ·  DrawFlow ▸ Project name   [Undo][Redo]  [Export ▸] │  48px, flush
├──────────┬─────────────────────────────────────────┬───────────┤
│ Left     │                                         │ Right     │
│ rail     │            Canvas stage                 │ inspector │
│ (tools + │        (centered artboard on a          │ (context- │
│ library) │         neutral workspace, zoom %)      │ sensitive)│
│ 260px    │                                         │  300px    │
├──────────┴─────────────────────────────────────────┴───────────┤
│  Timeline  ·  transport controls · ruler · element tracks       │  ~200px
└───────────────────────────────────────────────────────────────┘
```

### Design tokens

Define these once in CSS and use everywhere — no ad-hoc colors.

```css
:root {
  /* Neutral, slightly warm grays — not pure gray, not blue-gray */
  --bg-app:        #1c1c1e;   /* workspace behind the artboard */
  --bg-panel:      #242427;   /* rails, timeline, top bar */
  --bg-panel-2:    #2c2c30;   /* raised rows, inputs */
  --bg-hover:      #34343a;
  --border:        #3a3a40;   /* 1px hairlines, low contrast */
  --text-1:        #e8e8ea;   /* primary */
  --text-2:        #a0a0a8;   /* secondary / labels */
  --text-3:        #6c6c74;   /* disabled / hints */
  --accent:        #4f8cff;   /* ONE accent — used sparingly */
  --accent-weak:   #2a3a55;   /* accent wash for selected rows */
  --artboard:      #ffffff;   /* the canvas paper */
  --radius:        6px;       /* small, consistent; NOT 16-24px pills */
  --radius-lg:     8px;
}
```

Rules that keep it looking pro:
- **Dark chrome, light artboard.** The tool UI is dark and recedes; the user's canvas is the
  only bright thing on screen. This alone reads as "real editor".
- **One accent color, used only for:** the current selection, the playhead, the primary
  Export button, and focus rings. Everything else is grayscale.
- **Small radii (6–8px), hairline 1px borders.** No big rounded cards, no drop shadows except
  a single soft shadow under floating menus/popovers.
- **No gradients, no glassmorphism, no emoji anywhere in the UI.**
- **Dense, aligned typography.** Inter or the system UI stack. Sizes: 11px (timecodes, tick
  labels), 12px (labels, secondary), 13px (body/inputs), 14px (panel titles, medium weight).
  Numbers use `font-variant-numeric: tabular-nums`.
- **Left-align labels above compact inputs** in the inspector. Group related controls with a
  thin section header (12px, `--text-2`, uppercase tracking) and a hairline divider.
- **Icons are line icons (lucide), 16px, `--text-2`, brightening to `--text-1` on hover.**
  Icon buttons are 28–32px square with a subtle `--bg-hover` on hover — no borders at rest.
- **Sliders**: 4px track, 12px thumb, accent fill on the left of the thumb. Show the numeric
  value to the right in tabular figures with an editable number input.
- **The timeline** is the signature surface — make it look like a NLE:
  - A ruler across the top with tick marks and `MM:SS` labels at sensible intervals.
  - One horizontal **track per element**, ordered by z-index (top track = top layer).
  - Each element is a rounded-rect **clip** whose left edge = `startTime`, width =
    `drawDuration`. The clip shows the element label and a tiny kind icon. A subtle inner
    gradient is fine here (it reads as a media clip), but keep it monochrome + accent.
  - Dragging a clip body moves `startTime`; dragging its right edge resizes `drawDuration`.
  - A thin vertical **playhead** in the accent color spans all tracks; clicking the ruler
    seeks; the playhead is draggable.
  - The audio track sits in its own full-width lane at the bottom with a rendered waveform.
- **Empty states** are quiet, not cutesy: a single line of `--text-3` text ("Add text, a
  shape, or drop an SVG to begin"), no illustration, no emoji.
- **Buttons**: default = ghost (text + optional icon, hover bg). Secondary = `--bg-panel-2`
  with hairline border. Primary (Export only) = solid `--accent`. Never more than one primary
  button visible.
- **Transport controls** (play/pause/stop, skip-to-start/end, current timecode /
  total-timecode) centered above or within the timeline, monospace timecode.

### Left rail contents
Two stacked sections with a segmented toggle at top: **Add** and **Library**.
- **Add**: Text (opens a text-entry popover), and a grid of shape buttons (rectangle,
  rounded-rect, ellipse, line, arrow, star, checkmark, speech bubble) as 16px line-icon tiles.
  A "Drop SVG or click to import" dropzone.
- **Library**: a searchable grid of bundled SVG illustrations (Section 11), each a thumbnail;
  click to add to canvas.

### Right inspector (context-sensitive)
When nothing is selected: show **Project** settings (name, canvas size preset [16:9 1920×1080,
9:16 1080×1920, 1:1 1080×1080], fps, background color).
When an element is selected, grouped sections:
- **Transform**: X, Y, scale, rotation (number inputs + drag-scrub on the label).
- **Style**: stroke color, fill color, stroke width, "fill after drawing" toggle.
- **Animation**: draw style (segmented: Draw / Appear / Fade), draw duration (slider + input),
  start delay, and hand style (Marker / Pencil / Chalk / None).
- **Text** (text elements only): the text content, font family, font size — re-generates paths.
- Row of actions: duplicate, bring forward / send back, delete.

### Accessibility / polish
- Full keyboard: `Space` play/pause, `←/→` nudge playhead one frame, `Delete` removes
  selection, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo, `Cmd/Ctrl+D` duplicate.
- Focus-visible rings in the accent color on every interactive control.
- Respect `prefers-reduced-motion` for UI transitions (not for the user's animation preview).

---

## 10. Text → SVG paths (opentype.js)

Bundle one or two open-license fonts in `/public/fonts` (e.g. Inter, Caveat for a
handwritten look). On text add/edit:

```ts
import opentype from 'opentype.js';

const font = await opentype.load('/fonts/Caveat.ttf');   // cache the loaded font
const path = font.getPath(text, 0, fontSize, fontSize);  // x, y(baseline), fontSize
const d = path.toPathData(2);                            // single 'd' string
// For per-letter sequential drawing, use font.getPaths(...) and keep them as separate paths.
```

Store the generated `d` string(s) in `element.paths` and keep `text/fontSize/fontFamily` so
the user can edit and regenerate. A handwritten font (Caveat, Shadows Into Light) makes the
draw effect look far more convincing than a geometric sans.

---

## 11. Bundled asset library

Ship ~24 simple, single-color **outline** SVG illustrations so the app is usable out of the
box, grouped: Business (chart, handshake, target, briefcase, lightbulb, coins), Education
(book, graduation cap, pencil, atom, globe, ruler), Tech (laptop, gear, cloud, phone,
database, wifi), General (arrow, check, star, heart, location pin, speech bubble).

Requirements for library SVGs (and for user imports):
- **Stroke-based, path-only.** Flatten groups; convert shapes (`<rect>`, `<circle>`, etc.) to
  `<path>` on import so the draw effect works uniformly. Run imports through a normalizer that:
  strips `<style>`, inline fills you don't want, `id`s, and metadata; converts primitives to
  paths; and returns an array of `d` strings plus a viewBox for scaling.
- lucide-react is fine as the *source* of these outline shapes — its icons are clean single-
  stroke paths; re-export the ones you want as static path data, or bundle a small curated set.

---

## 12. Build phases (do them in this order)

**Phase 0 — Scaffold & headers.** Vite + TS + Tailwind + tokens. `vite.config.ts` with COOP/COEP
headers. Verify `self.crossOriginIsolated === true` in console.
*Acceptance:* app boots, dark shell with the four-region layout renders empty, console shows
cross-origin isolated `true`.

**Phase 1 — Store + canvas + the draw effect.** Zustand store (Section 5), the pure canvas
renderer (Section 7), and `lib/drawing.ts` (Section 4). Hardcode one rectangle element to prove
it draws when you scrub a temporary slider bound to `currentTime`.
*Acceptance:* dragging the slider draws the rectangle's outline progressively; a placeholder
hand follows the tip.

**Phase 2 — Playback clock + transport.** `usePlaybackClock`, play/pause/stop, timecode.
*Acceptance:* pressing play animates the rectangle drawing itself in real time and stops at
`duration`.

**Phase 3 — Add elements.** Left rail Add section: text (opentype.js), shapes, SVG import with
the normalizer. Elements land on the canvas and are selectable/draggable.
*Acceptance:* can type text that draws letter-by-letter; can add a shape; can import an SVG and
have it draw.

**Phase 4 — Timeline editor.** Tracks per element, draggable/resizable clips, ruler, draggable
playhead, seek-on-click. Two-way bound to `startTime`/`drawDuration`/`zIndex`.
*Acceptance:* moving a clip changes when its element starts; resizing changes how long it draws;
reordering tracks changes layer order on canvas.

**Phase 5 — Inspector.** Full context-sensitive inspector (Section 9). All controls two-way
bound. Project settings when nothing selected.
*Acceptance:* every element property is editable from the inspector and reflects live on canvas.

**Phase 6 — Undo/redo + shortcuts.** zundo wiring with `partialize`; all keyboard shortcuts.
*Acceptance:* undo/redo works and does not record scrubbing/playback; shortcuts all fire.

**Phase 7 — Audio.** Upload, decode to `AudioBuffer`, wavesurfer waveform in the audio lane,
Web Audio playback synced to the clock, volume.
*Acceptance:* uploaded audio shows a waveform and plays in sync with the animation.

**Phase 8 — Export.** Lazy-load ffmpeg, deterministic frame capture (Section 8), progress UI,
MP4 + WebM, 720p/1080p presets, download. Handle the non-isolated error.
*Acceptance:* exporting produces a playable MP4 whose motion matches the preview, with audio.

**Phase 9 — Library + polish.** Bundled asset library, empty states, focus states, reduced-
motion, final visual pass against Section 9.
*Acceptance:* app looks like a real editor; a first-time user can make and export a 10s scribe
without instructions.

---

## 13. Suggested file structure

```
src/
  main.tsx
  App.tsx
  index.css                 # tokens + tailwind
  store/
    useStore.ts             # zustand + zundo
    selectors.ts
  lib/
    drawing.ts              # dash/hand math (Section 4)
    textToPaths.ts          # opentype.js wrapper
    svgImport.ts            # normalizer → d[] + viewBox
    exportVideo.ts          # frame capture + ffmpeg
    ffmpegClient.ts         # lazy singleton loader
    time.ts                 # formatting, frame<->seconds
  hooks/
    usePlaybackClock.ts
    useKeyboardShortcuts.ts
    useCanvasInteractions.ts
  components/
    layout/{TopBar,LeftRail,Inspector,Timeline,Workspace}.tsx
    canvas/{Stage,ElementNode,Hand,SelectionBox}.tsx
    timeline/{Ruler,Track,Clip,Playhead,Transport,AudioLane}.tsx
    inspector/{TransformSection,StyleSection,AnimationSection,TextSection,ProjectSection}.tsx
    library/{AddPanel,LibraryPanel,ShapeButton,Dropzone}.tsx
    ui/{Button,IconButton,Slider,NumberInput,ColorInput,Segmented,Popover,Field}.tsx
  assets/
    hands/{marker,pencil,chalk}.svg
    library/*.svg
    shapes.ts               # shape → d string generators
  fonts/ (in /public)
```

---

## 14. Non-goals for MVP (say no, keep scope tight)

- No multi-user / cloud sync / accounts.
- No cloud rendering — export is client-side only.
- No camera moves / per-property keyframing beyond draw timing (can come later).
- No H.265/AV1 export (not in the standard ffmpeg.wasm build).
- No mobile layout for v1 (desktop editor first; a responsive pass is a later phase).

---

## 15. Known pitfalls (tell Claude Code to watch for these)

1. **Export fails silently** → almost always missing COOP/COEP headers or non-HTTPS. Check
   `crossOriginIsolated` first and show a real error.
2. **Odd pixel dimensions** crash libx264 → keep the `crop=trunc(iw/2)*2:...` filter.
3. **Undo eating every scrub** → `partialize` out `currentTime`/`isPlaying`/export fields.
4. **Hand jitter** → sample the direction vector a couple of px behind the tip, and smooth
   the angle across frames.
5. **`getTotalLength()` on a detached path returns 0** → measure only after the path is in the
   live DOM (or use a hidden measuring `<svg>` that's actually mounted).
6. **Text with a geometric font looks fake when "drawn"** → default to a handwritten font.
7. **ffmpeg loaded at startup** tanks first paint → load it lazily on first export and cache.
8. **Memory leaks across exports** → delete frames from the ffmpeg FS and revoke object URLs.

---

*End of specification.*