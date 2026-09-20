# DrawFlow — Feature Checklist

Status as of 20 Sep 2026, checked against the code in this repo.

| Symbol | Meaning |
|---|---|
| ✅ | Done and working |
| 🟡 | Partly there — see note |
| ⬜ | Not started |

## At a glance

| Section | ✅ Done | 🟡 Partial | ⬜ Not yet |
|---|---:|---:|---:|
| 1. Core canvas / editor | 6 | 4 | 9 |
| 2. Drawing / whiteboard effect | 10 | 0 | 11 |
| 3. Animation system | 4 | 0 | 6 |
| 4. Timeline | 10 | 5 | 11 |
| 5. Camera | 8 | 3 | 1 |
| 6. Scenes | 0 | 0 | 6 |
| 7. Assets | 10 | 4 | 8 |
| 8. Characters | 0 | 1 | 3 |
| 9. Text | 4 | 3 | 7 |
| 10. Audio | 10 | 2 | 5 |
| 11. Export / rendering | 7 | 2 | 13 |
| 12. Project system | 8 | 1 | 2 |
| 13. Templates | 1 | 0 | 3 |
| 14. Collaboration | 1 | 0 | 1 |
| 15. AI | 5 | 4 | 5 |
| 16. Keyboard shortcuts | 4 | 1 | 6 |
| 17. Developer / open-source | 2 | 1 | 8 |
| 18. Professional UX | 6 | 0 | 9 |
| **Total** | **96** | **31** | **114** |

**V1 is complete apart from Scenes.** Export, audio, camera, project files and the AI assistant are all working; the remaining work is mostly editor polish (multi-select, copy/paste), more animation types, scenes, templates and the open-source tooling (CLI, plugins).

---

## 1. Core canvas / editor

| Status | Feature | Note |
|---|---|---|
| ✅ | Infinite canvas | Artboard sits on an unbounded pasteboard |
| ✅ | Video presets 16:9, 9:16, 1:1 | Project panel |
| ✅ | Zoom in / out | Mouse wheel on the stage |
| ✅ | Pan canvas | Hand cursor over empty paper, drag to pan |
| 🟡 | Grid / guides | Grid, dots and lined *paper styles* only; no smart guides |
| ⬜ | Snap to grid | |
| ⬜ | Rulers | |
| ✅ | Undo / redo | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y |
| ⬜ | Copy / paste | |
| ✅ | Duplicate | Ctrl+D |
| ⬜ | Multi-select | Single selection only |
| ⬜ | Group / ungroup | |
| ⬜ | Lock objects | |
| ⬜ | Hide objects | |
| 🟡 | Layers | Stacking follows draw order (VideoScribe model); no layers panel |
| ⬜ | Alignment tools | |
| ⬜ | Distribute objects | |
| 🟡 | Bring forward / send backward | Reorder on the timeline strip changes stacking too |
| 🟡 | Delete / replace asset | Delete yes; replace-in-place no |

## 2. Drawing / whiteboard effect

| Status | Feature | Note |
|---|---|---|
| ✅ | SVG stroke-by-stroke drawing | Dash-offset reveal per path |
| ✅ | PNG / JPG reveal | Scribble-mask reveal with the hand |
| ✅ | Automatic drawing-path detection | Path order from the SVG; auto scribble path for rasters |
| ✅ | Progressive stroke drawing | |
| ✅ | Adjustable drawing speed | "Animate" seconds per element |
| ✅ | Outline reveal | Outline first, fill appears after (`fillAfterDraw`) |
| ⬜ | Draw left→right / right→left / top→bottom / centre | Only stroke-order draw |
| ⬜ | Radial reveal | |
| ⬜ | Wipe reveal | |
| ⬜ | Fill reveal | |
| ⬜ | Adjustable stroke order | Follows SVG order |
| ✅ | Hand follows drawing path | |
| ⬜ | Hand movement smoothing | Hand sits exactly on the path point |
| ⬜ | Hand position offset | Fixed per hand |
| ⬜ | Custom drawing hands | No user upload |
| ✅ | Pen hand | Photographic, arm runs off the board |
| ✅ | Marker hand | |
| ✅ | Chalk hand | (in place of pencil) |
| ⬜ | Pencil hand | |
| ⬜ | Brush hand | |
| ⬜ | Eraser hand | |

## 3. Animation system

| Status | Feature | Note |
|---|---|---|
| ✅ | Entrance · Draw | |
| ✅ | Entrance · Fade in | |
| ✅ | Entrance · Slide in | From left / right / top / bottom |
| ✅ | Entrance · Appear | (extra) |
| ⬜ | Entrance · Wipe | |
| ⬜ | Entrance · Scale in | |
| ⬜ | Entrance · Pop | |
| ⬜ | Entrance · Bounce | |
| ⬜ | Emphasis · Pulse / Shake / Bounce / Rotate / Scale / Highlight | No emphasis effects yet |
| ⬜ | Exit · Fade out / Slide out / Wipe out / Erase / Reverse draw | No exit effects yet — elements stay on the board |

## 4. Timeline

| Status | Feature | Note |
|---|---|---|
| ✅ | Horizontal timeline | Element strip + audio lanes + scrub bar |
| 🟡 | Object tracks | One sequential strip (VideoScribe style), not free tracks |
| ✅ | Audio tracks | Music + Voice lanes |
| ⬜ | Scene tracks | |
| ✅ | Playhead | |
| 🟡 | Drag object duration | Edited by numbers on the card, not by dragging |
| 🟡 | Move object timing | Drag to reorder; elements always play one after another |
| ✅ | Animation duration | Animate |
| ✅ | Delay before animation | Transition (camera move) + Pause (hold after) |
| ✅ | Start / end times | Derived from the sequence, shown on cards |
| ⬜ | Timeline zoom | Strip fits the project length |
| 🟡 | Snap timing | Audio clips snap to clip edges / playhead |
| ✅ | Split | Audio clips, `S` at playhead |
| ✅ | Trim | Audio clip edge drag |
| ⬜ | Copy / paste timing | |
| ⬜ | Multiple objects at the same time | |
| ✅ | Sequential animation | |
| ⬜ | Parallel animation | |
| ⬜ | Keyframes | |
| 🟡 | Easing | Camera easing only (ease-out / linear / cut) |
| ⬜ | Curve editor | |
| ✅ | Audio waveform under objects | Waveforms drawn in the lanes |
| ⬜ | "Fit animation to narration" | |
| ⬜ | Select sentence → adjust timing | |
| ⬜ | Snap object timing to waveform | |
| ⬜ | Markers on timeline | |

## 5. Camera

| Status | Feature | Note |
|---|---|---|
| ✅ | Camera position | |
| ✅ | Camera zoom | |
| ✅ | Camera pan | |
| ⬜ | Camera rotation | |
| 🟡 | Camera keyframes | One "shot" per element (auto / previous / whole / custom); no free keyframes |
| ✅ | Camera easing | ease-out / linear / cut |
| 🟡 | Camera path | Straight interpolation between shots |
| ✅ | Automatic camera framing | Fill % + per-element zoom tightness |
| ✅ | Focus on object | Click a card; resizable camera boundary on the stage |
| 🟡 | Focus on scene | "Whole scribe" mode; no scenes yet |
| ✅ | Camera preview | Boundary frame in Edit view, exact frame in Preview |
| ✅ | End on last shot / optional pull-back | (extra) |

## 6. Scenes

| Status | Feature | Note |
|---|---|---|
| ⬜ | Create / delete / duplicate / rename / reorder scenes | Project is one continuous scribe |
| ⬜ | Scene duration | |
| ⬜ | Scene thumbnails | |
| ⬜ | Scene transitions | |
| ⬜ | Scene-specific background / audio / camera | |
| ⬜ | Scene templates | |

## 7. Assets

| Status | Feature | Note |
|---|---|---|
| ✅ | Import SVG | Arcs, even-odd fills, per-path colours preserved |
| ✅ | Import PNG / JPG / WebP | Alpha kept for PNG / WebP |
| 🟡 | Import GIF | First frame only (still) |
| ⬜ | PDF → assets | |
| ✅ | Drag / drop files | Drop zone in the Images panel |
| ✅ | Asset library | OpenMoji line-art + Open Doodles people |
| ✅ | Categories | 11 categories |
| ✅ | Search | Names + tags |
| 🟡 | Tags | Used by search; no tag editing |
| ⬜ | Favorites | |
| ⬜ | Recently used | |
| 🟡 | Custom asset collections | Persistent Uploads gallery (IndexedDB) |
| ⬜ | Import asset packs | |
| ⬜ | Export asset packs | |
| ✅ | Resize | |
| ✅ | Rotate | |
| ⬜ | Crop | |
| ⬜ | Flip | |
| ✅ | Change colour | Stroke / fill |
| ⬜ | Opacity | |
| ✅ | Stroke width | |
| 🟡 | Recolour SVG | One stroke + one fill override; multi-colour art keeps its own colours |

## 8. Characters

| Status | Feature | Note |
|---|---|---|
| 🟡 | Character library | "Sketch people" — static Open Doodles poses (standing, sitting, …) |
| ⬜ | Custom characters, poses, expressions, hand positions | |
| ⬜ | Walking / talking / pointing | |
| ⬜ | Custom character parts | |

## 9. Text

| Status | Feature | Note |
|---|---|---|
| ✅ | Text objects | Converted to glyph outlines so the hand can draw them |
| 🟡 | Custom fonts | 3 bundled (Caveat, Shadows Into Light, Inter); no user font upload |
| ✅ | Font size | |
| ⬜ | Bold | |
| ⬜ | Italic | |
| ⬜ | Alignment | |
| ⬜ | Line spacing | |
| ⬜ | Letter spacing | |
| ✅ | Text colour | |
| ✅ | Text draw / reveal (handwritten effect) | |
| 🟡 | Text animation | Draw / fade / slide / appear |
| ⬜ | Typewriter effect | |
| 🟡 | Multilingual | Latin scripts only (bundled fonts) |
| ⬜ | RTL support | |

## 10. Audio

| Status | Feature | Note |
|---|---|---|
| ✅ | Import MP3 / WAV | Anything the browser decodes (also OGG, M4A, WebM) |
| ✅ | Voiceover | Recorded in-app or imported |
| ✅ | Background music | |
| 🟡 | Sound effects | Any clip can go on either lane; no SFX library |
| ✅ | Volume | Per clip, live while playing |
| ✅ | Fade in / fade out | |
| ✅ | Trim | |
| ✅ | Split | `S` at playhead |
| ✅ | Audio waveform | |
| 🟡 | Multiple audio tracks | Two lanes (music, voice), many clips per lane |
| ✅ | Mute | |
| ⬜ | Solo | |
| ✅ | Record microphone | With live level meter, lands on the Voice lane |
| ⬜ | Noise reduction | |
| ⬜ | Audio normalisation | |
| ⬜ | AI voice generation | |
| ⬜ | Automatic narration sync | |

## 11. Export / rendering

| Status | Feature | Note |
|---|---|---|
| ✅ | MP4 (H.264 + AAC) | |
| ✅ | WebM (VP9 + Opus) | Software encoder, slower |
| ⬜ | GIF | |
| ⬜ | PNG frame | |
| ⬜ | Image sequence | |
| ✅ | 720p / 1080p | |
| ⬜ | 1440p / 4K | |
| ✅ | 24 / 30 / 60 fps | |
| ⬜ | Custom resolution | Presets only |
| ✅ | Hardware acceleration | MP4 uses the browser's WebCodecs H.264 encoder (~45 s for a 27 s 1080p clip) |
| 🟡 | GPU rendering | Encoding yes; frame rasterisation is still CPU (SVG → canvas) |
| 🟡 | Multi-threaded rendering | Encoder runs off-thread; ffmpeg.wasm is single-threaded |
| ✅ | Render preview | Preview plays the same frame function the export uses |
| ✅ | Render progress | |
| ⬜ | Background rendering | Tab must stay open |
| ⬜ | Render queue | |
| ⬜ | Cancel render | |
| ⬜ | Resume render | |
| ⬜ | Headless rendering | |
| ⬜ | CLI rendering (`drawflow render project.drawflow`) | |
| ⬜ | Render only selected scene | |
| ⬜ | Low-quality preview mode | |

## 12. Project system

| Status | Feature | Note |
|---|---|---|
| ✅ | `.drawflow` project format | `.drawflow.json`, single self-contained file |
| ✅ | Human-readable JSON | Audio embedded as base64 |
| ✅ | Autosave | IndexedDB checkpoint, 1.5 s after each change |
| ✅ | Project recovery | Last checkpoint restored on open |
| ⬜ | Project backups | Single checkpoint only |
| ⬜ | Version history | |
| ✅ | Import project | Open file… |
| ✅ | Export project | Save to file… |
| 🟡 | Project validation | Tolerant loader; no formal schema |
| ✅ | Missing asset detection / relink | Not needed — every asset is embedded in the file |
| ✅ | Portable projects | |

## 13. Templates

| Status | Feature | Note |
|---|---|---|
| ✅ | Blank project | |
| ⬜ | Explainer / YouTube intro / Educational / Product demo / Presentation / Social / Training / Marketing | |
| ⬜ | Save scene / project as template | |
| ⬜ | Community templates | |

## 14. Collaboration

| Status | Feature | Note |
|---|---|---|
| ✅ | Local-first, no account, no tracking | |
| ⬜ | Comments / share / links / teams / version history / live editing / cloud | Intentionally not started |

## 15. AI

| Status | Feature | Note |
|---|---|---|
| ✅ | Bring-your-own-key: Anthropic, OpenAI, Groq, Gemini | Keys stay in the browser; model list fetched live |
| ✅ | Generate SVG illustration from text | Planner picks library art or hand-writes SVG |
| ✅ | Image → whiteboard drawing | Offline doodle engine (edge trace → strokes), no API needed |
| ✅ | Auto-trace raster → SVG | Same engine; result is real strokes the hand draws |
| ✅ | Photo → cartoon | Gemini / OpenAI image models |
| 🟡 | Script → suggested assets | A description becomes 2–6 items placed in order |
| 🟡 | Script → timeline | Items added sequentially with default timing |
| 🟡 | Automatic drawing order | Nearest-neighbour stroke ordering inside the doodle engine |
| 🟡 | Automatic camera positions | Auto-framing is the default for every element |
| ⬜ | Script → scenes | |
| ⬜ | Script → narration | |
| ⬜ | Auto scene generation | |
| ⬜ | Automatic timing | |
| ⬜ | Voice → timeline synchronisation | |

## 16. Keyboard shortcuts

| Status | Feature | Note |
|---|---|---|
| ✅ | Ctrl+Z / Ctrl+Shift+Z | Also Ctrl+Y |
| ⬜ | Ctrl+C / Ctrl+V | |
| ✅ | Ctrl+D | |
| ✅ | Delete / Backspace | |
| ✅ | Space = play / pause | |
| ⬜ | Arrow keys = nudge selection | ←/→ currently step one frame |
| ⬜ | Shift + arrows = faster nudge | |
| ⬜ | Zoom shortcuts | Wheel only |
| 🟡 | Timeline shortcuts | ←/→ frame step, `S` split, Esc deselect |
| ⬜ | Camera shortcuts | |
| ⬜ | Fullscreen preview | |

## 17. Developer / open-source

| Status | Feature | Note |
|---|---|---|
| ✅ | TypeScript types | `src/types.ts` |
| ✅ | Desktop build (Electron, Windows installer) | `npm run desktop:pack` |
| 🟡 | Documentation | README + CREDITS |
| ⬜ | Project JSON schema | |
| ⬜ | Plugin system / API / SDK | |
| ⬜ | Custom animations, asset providers, exporters, renderers, tools | |
| ⬜ | CLI (`create`, `preview`, `render`) | |
| ⬜ | Node / Python API | |
| ⬜ | Example projects | |
| ⬜ | Test projects | |
| ⬜ | Rendering benchmarks | |

## 18. Professional UX

| Status | Feature | Note |
|---|---|---|
| ✅ | Autosave indicator | |
| ✅ | Loading / progress indicators | |
| ✅ | Render progress | |
| ✅ | Error messages | Export errors shown in the dialog; confirm dialogs for destructive actions |
| ✅ | Crash recovery | Checkpoint restore |
| ✅ | Asset search | |
| ⬜ | Recent projects | |
| ⬜ | Project thumbnails | |
| ⬜ | Dark / light UI | Light only |
| ⬜ | Customisable panels | |
| ⬜ | Resizable timeline | |
| ⬜ | Full-screen preview | |
| ⬜ | Before / after preview | |
| ⬜ | Performance statistics | |
| ⬜ | Command palette | |

---

## Roadmap

### V1 — Core

| Status | Item |
|---|---|
| ✅ | Canvas |
| ✅ | SVG import |
| ✅ | PNG / JPG import |
| ✅ | Text |
| 🟡 | Layers (stacking = draw order) |
| ✅ | Basic draw animation |
| ✅ | Hand animation |
| ✅ | Basic animations |
| ✅ | Timeline |
| ⬜ | Scenes |
| ✅ | Camera |
| ✅ | Audio |
| ✅ | Project save / load |
| ✅ | MP4 export |
| ✅ | 1080p |
| ✅ | Autosave |
| ✅ | Undo / redo |

### V1.5 — Make it actually good

| Status | Item |
|---|---|
| 🟡 | Advanced timeline |
| ✅ | Audio waveform |
| ⬜ | Keyframes |
| 🟡 | Easing (camera only) |
| 🟡 | Camera keyframes (per-element shots) |
| ✅ | Multiple hands |
| ✅ | Better SVG path detection |
| ✅ | Asset library |
| ⬜ | Templates |
| ✅ | Project recovery |
| ✅ | Fast renderer (hardware H.264) |

### V2 — Open-source differentiators

| Status | Item |
|---|---|
| ⬜ | CLI renderer |
| ⬜ | Project JSON schema |
| ⬜ | Plugin system |
| ⬜ | Asset-pack system |
| ⬜ | Community templates / asset packs |
| ⬜ | Python / Node API |
| ⬜ | Batch rendering |
| ✅ | GPU acceleration (encoding) |
| ⬜ | Render queue |

### V3 — AI

| Status | Item |
|---|---|
| ⬜ | Script → scenes |
| 🟡 | Script → assets |
| 🟡 | Script → timeline |
| ✅ | Image → whiteboard drawing |
| 🟡 | Auto camera |
| ⬜ | Auto timing |
| ⬜ | Voice → animation sync |
| ✅ | AI SVG generation |

---

## Suggested next steps

Biggest gaps against the roadmap, roughly in order of impact:

1. **Multi-select, copy/paste, arrow-key nudge** — the most-felt editor gaps.
2. **Emphasis and exit effects** (pulse, shake, fade out, erase) — the animation system only has entrances.
3. **Timeline zoom + drag-to-resize durations** on the strip.
4. **Cancel export**, then GIF / PNG-sequence output.
5. **Scenes** — the one V1 item still missing; also unlocks "render selected scene".
6. **Templates** and recent projects / thumbnails on a start screen.
