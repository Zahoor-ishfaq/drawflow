# DrawFlow — Feature Checklist

Status as of 20 Sep 2026, checked against the code in this repo.

| Symbol | Meaning |
| --- | --- |
| ✅ | Done and working |
| 🟡 | Partly there — see note |
| ⬜ | Not started |

## At a glance

| Section | ✅ Done | 🟡 Partial | ⬜ Not yet |
| --- | ---: | ---: | ---: |
| 1. Core canvas / editor | 19 | 0 | 0 |
| 2. Drawing / whiteboard effect | 18 | 1 | 1 |
| 3. Animation system | 11 | 0 | 0 |
| 4. Timeline | 23 | 1 | 2 |
| 5. Camera | 7 | 2 | 1 |
| 6. Scenes | 9 | 1 | 0 |
| 7. Assets | 19 | 2 | 0 |
| 8. Characters | 4 | 2 | 1 |
| 9. Text | 14 | 1 | 0 |
| 10. Audio | 13 | 0 | 0 |
| 11. Export / rendering | 19 | 2 | 1 |
| 12. Project system | 11 | 0 | 0 |
| 13. Templates | 4 | 1 | 0 |
| 14. Collaboration | 1 | 0 | 1 |
| 15. AI | 14 | 0 | 0 |
| 16. Keyboard shortcuts | 12 | 0 | 0 |
| 17. Developer / open-source | 14 | 1 | 1 |
| 18. Professional UX | 13 | 1 | 1 |
| **Total** | **225** | **15** | **9** |

**Every roadmap phase (V1–V3) is complete** apart from keyframes (a deliberate design choice) and things that need a server (collaboration). What remains is listed at the end under *Not built, and why*.

---

## 1. Core canvas / editor

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Infinite canvas | Artboard sits on an unbounded pasteboard |
| ✅ | Video presets 16:9, 9:16, 1:1 | Project panel |
| ✅ | Zoom in / out | Wheel, Ctrl+= / Ctrl+-, Ctrl+0 fit, Ctrl+1 100% |
| ✅ | Pan canvas | Hand cursor over empty paper, middle-drag anywhere |
| ✅ | Grid / guides | Grid overlay when snapping is on; smart alignment guides to other elements and the frame while dragging |
| ✅ | Snap to grid | View menu / Ctrl+', grid size 10–100 px |
| ✅ | Rulers | Ctrl+R |
| ✅ | Undo / redo | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y |
| ✅ | Copy / paste | Ctrl+C/X/V, survives reloads, repeated pastes offset |
| ✅ | Duplicate | Ctrl+D |
| ✅ | Multi-select | Shift-click, Ctrl+A, Shift-drag marquee; group move |
| ✅ | Group / ungroup | Ctrl+G / Ctrl+Shift+G — vector elements are merged with transforms baked in (rasters can't be merged) |
| ✅ | Lock objects | Ctrl+L; locked elements are skipped by canvas clicks |
| ✅ | Hide objects | Ctrl+Shift+H; hidden elements take no time and are left out of the video |
| ✅ | Layers | Layers panel: drag rows (or arrows) to reorder, rename, lock, hide; stacking follows draw order plus optional per-element layer offsets |
| ✅ | Alignment tools | Left / centre / right / top / middle / bottom — to each other, or to the frame for one element |
| ✅ | Distribute objects | Even horizontal / vertical spacing |
| ✅ | Bring forward / send backward | `[` `]` and Ctrl+`[` `]`, plus the Layers panel |
| ✅ | Delete / replace asset | "Replace image…" keeps timing and transform |

## 2. Drawing / whiteboard effect

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | SVG stroke-by-stroke drawing | Dash-offset reveal per path |
| ✅ | PNG / JPG reveal | Scribble (default), wipe, radial or centre-out reveal |
| ✅ | Automatic drawing-path detection | Path order from the SVG; auto scribble path for rasters |
| ✅ | Progressive stroke drawing | |
| ✅ | Adjustable drawing speed | "Animate" seconds per element |
| ✅ | Outline reveal | Outline first, fill fades in after (`fillAfterDraw`) |
| ✅ | Draw left→right / right→left / top→bottom / centre | Stroke order for vector art; wipe direction and centre-out for photos |
| ✅ | Radial reveal | Photos |
| ✅ | Wipe reveal | Photos (any side) |
| 🟡 | Fill reveal | Fill fades in after the outline; no directional fill sweep |
| ✅ | Adjustable stroke order | File order, reverse, left→right, right→left, top→bottom, bottom→top, centre out |
| ✅ | Hand follows drawing path | Also follows erase and reverse-draw exits |
| ✅ | Hand movement smoothing | Project setting 0–1 |
| ✅ | Hand position offset | Project setting, for uploaded hands whose tip is slightly off |
| ✅ | Custom drawing hands | Upload a transparent PNG/WebP, click the pen tip, set the size |
| ✅ | Pen hand | Photographic, arm runs off the board |
| ✅ | Marker hand | |
| ✅ | Chalk hand | |
| ✅ | Left- and right-handed variants | Every photographic hand comes as a right hand (arm from the right) and a mirrored left hand |
| ⬜ | Pencil / brush / eraser hands | No photographs yet (cartoon versions were removed as not realistic enough); upload your own photo meanwhile |

## 3. Animation system

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Entrance · Draw | |
| ✅ | Entrance · Fade in | With easing |
| ✅ | Entrance · Slide in | From any side, with easing |
| ✅ | Entrance · Wipe | From any side |
| ✅ | Entrance · Scale in | |
| ✅ | Entrance · Pop | Overshoot |
| ✅ | Entrance · Bounce | Drops in and bounces |
| ✅ | Entrance · Typewriter / Appear | Typewriter for text (glyph by glyph) |
| ✅ | Emphasis · Pulse / Shake / Bounce / Rotate / Scale / Highlight | Spin = rotate, Grow = scale; duration, delay and repeat count; the next element waits |
| ✅ | Exit · Fade out / Slide out / Wipe out / Erase / Reverse draw | Plus Shrink; delay after the element's pause; erase and reverse draw are performed by the hand |
| ✅ | Plugin effects | Plugins can add entrance / emphasis / exit effects that render in preview, export and CLI |

## 4. Timeline

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Horizontal timeline | Ruler, element track, three audio lanes, film strip |
| ✅ | Object tracks | Time-proportional element track (transition gap, draw, emphasis, pause, exit) |
| ✅ | Audio tracks | Music, voice, sound effects — a lane shows when it has clips or is switched on |
| ✅ | Scene tracks | Scene headers group the film strip (right-click for rename, settings, reorder, duplicate, delete); element blocks coloured by scene |
| ✅ | Playhead | Auto-scrolls while playing when zoomed |
| ✅ | Drag object duration | Drag the draw / pause / transition edges of a block |
| ✅ | Move object timing | Drag a block to reorder; elements always play in sequence |
| ✅ | Animation duration | Animate |
| ✅ | Delay before animation | Transition (camera move) + Pause (hold after) |
| ✅ | Start / end times | Derived from the sequence, shown on blocks and cards |
| ✅ | Timeline zoom | Ctrl+wheel around the cursor, ± buttons, fit |
| ✅ | Snap timing | Markers, clip edges, other elements, playhead, whole seconds (with a snap line) |
| ✅ | Split | Audio clips, `S` at playhead |
| ✅ | Trim | Audio clip edge drag |
| ✅ | Copy / paste timing | Ctrl+Shift+C / V copies Animate, Pause, Transition, effects, camera and hand |
| ✅ | Multiple objects at the same time | "Start together with the previous element" |
| ✅ | Sequential animation | |
| ✅ | Parallel animation | Start-with-previous groups |
| ⬜ | Keyframes | By design the model is effect-based; plugins can implement keyframed motion as effects |
| ✅ | Easing | Camera easing and per-effect easing (ease out / in / smooth / linear) |
| ⬜ | Curve editor | |
| ✅ | Audio waveform under objects | |
| ✅ | "Fit animation to narration" | From silence detection (offline) or Whisper sentence timestamps (Groq / OpenAI) |
| 🟡 | Select sentence → adjust timing | Sentences come from the transcript and are matched in order; no click-a-sentence UI |
| ✅ | Snap object timing to waveform | Element edges snap to clip boundaries; phrase fitting aligns to speech |
| ✅ | Markers on timeline | `M` / double-click the ruler; drag, rename, colour, delete; everything snaps to them |

## 5. Camera

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Camera position / zoom / pan | |
| ⬜ | Camera rotation | |
| 🟡 | Camera keyframes | One shot per element (stay / this shot / zoom / scene / all); no free keyframes |
| ✅ | Camera easing | ease-out / linear / cut |
| 🟡 | Camera path | Straight interpolation between shots |
| ✅ | Automatic camera framing | Fill % + per-element zoom tightness |
| ✅ | Focus on object | Click a card; resizable camera boundary on the stage; `F` frames the selection |
| ✅ | Focus on scene | "Scene" framing shows everything in the element's scene |
| ✅ | Camera preview | Boundary frame in Edit view, exact frame in Preview and full-screen preview |
| ✅ | End on last shot / optional pull-back | |

## 6. Scenes

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Create / delete / duplicate / rename / reorder scenes | Chips above the timeline; delete keeps or removes the elements |
| ✅ | Scene duration | Shown on the chip tooltip and the coloured track |
| 🟡 | Scene thumbnails | Chips show element counts; project thumbnails exist, per-scene pictures don't |
| ✅ | Scene transitions | Cut, fade, wipe with adjustable length |
| ✅ | Scene-specific background | Paper style / colour per scene |
| ✅ | Scene-specific audio | A clip can belong to a scene and moves with it |
| ✅ | Scene-specific camera | "Camera: whole scene" |
| ✅ | Clear the board between scenes | "Clear before" |
| ✅ | Scene templates | Save a scene as a template; insert it into any project |
| ✅ | Render one scene | Export dialog and `drawflow render --scene` |

## 7. Assets

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Import SVG / PNG / JPG / WebP | |
| 🟡 | Import GIF | First frame only (still) |
| ✅ | PDF → assets | Each page becomes a picture (pdf.js) |
| ✅ | Drag / drop files | Images panel drop zone; audio onto lanes |
| ✅ | Asset library | 5,000+ open-licensed pictures: Tabler & Health line icons, Flowbite & illlustrations.co scenes, Mega Doodles cartoons, Open Doodles & Open Peeps people, OpenMoji in black or colour |
| ✅ | Categories | 11 categories plus Favourites and Recent |
| ✅ | Search | One search over 5,000+ pictures (icons, scenes, cartoons, people, glyphs), shapes and uploads — ranked, with synonyms, plurals and typo tolerance |
| ✅ | Tags | Editable on uploads; used by search |
| ✅ | Favorites | Star any library picture or upload |
| ✅ | Recently used | |
| ✅ | Custom asset collections | Persistent Uploads gallery; packs |
| ✅ | Import asset packs | .zip of pictures with optional manifest.json; folders become tags |
| ✅ | Export asset packs | Uploads → .zip with manifest |
| ✅ | Plugin asset providers | Plugins can add searchable sources |
| ✅ | Resize / Rotate | Handles + numeric |
| ✅ | Crop | Image inset per side |
| ✅ | Flip | Horizontal / vertical |
| ✅ | Change colour | Stroke / fill |
| ✅ | Opacity | |
| ✅ | Stroke width | |
| 🟡 | Recolour SVG | One stroke + one fill override; multi-colour art keeps its own colours |

## 8. Characters

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Character library | "People" tab: poses, expressions, gestures, roles with search |
| 🟡 | Custom characters | Compose a pose + face + prop and group them; no rig editor |
| ✅ | Multiple poses | 33 full-body sketch poses (sitting, standing, reading, running, dancing…) |
| ✅ | Facial expressions | 70 faces |
| ✅ | Different hand positions | Gesture pictures |
| 🟡 | Walking / talking / pointing | Static poses animated with emphasis effects; no skeletal animation |
| ⬜ | Custom character parts | |

## 9. Text

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Text objects | Glyph outlines drawn by the hand |
| ✅ | Custom fonts | Three bundled + upload your own TTF/OTF (kept in the project) |
| ✅ | Font size | |
| ✅ | Bold | Synthetic weight |
| ✅ | Italic | Synthetic skew |
| ✅ | Alignment | Left / centre / right |
| ✅ | Line spacing | |
| ✅ | Letter spacing | |
| ✅ | Text colour | |
| ✅ | Text animation | Draw / typewriter / any entrance, emphasis, exit |
| ✅ | Handwritten text effect | |
| ✅ | Typewriter effect | |
| ✅ | Text draw / reveal | |
| ✅ | Multilingual text | Any script whose font you add |
| 🟡 | RTL support | Right-to-left ordering with auto-detection; Arabic letters are not joined (no shaping engine) |

## 10. Audio

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Import MP3 / WAV | Anything the browser decodes (also OGG, M4A, WebM) |
| ✅ | Voiceover | Recorded in-app, imported, or generated |
| ✅ | Background music | |
| ✅ | Sound effects | Dedicated lane, twelve built-in synthesised effects, or your own |
| ✅ | Volume / fade in / fade out / trim / split | |
| ✅ | Audio waveform | |
| ✅ | Multiple audio tracks | Music, voice, sfx lanes, many clips each |
| ✅ | Mute / solo | |
| ✅ | Record microphone | Live level meter, lands on the Voice lane |
| ✅ | Noise reduction | Basic: high-pass + noise gate rendered into a clean copy |
| ✅ | Audio normalisation | Peak to 90% |
| ✅ | AI voice generation | OpenAI, Groq (PlayAI) or Gemini TTS with your key |
| ✅ | Automatic narration sync | Fit to pauses (offline) or to transcribed sentences |

## 11. Export / rendering

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | MP4 (H.264 + AAC) | |
| ✅ | WebM (VP9 + Opus) | |
| ✅ | GIF | ≤15 fps |
| ✅ | PNG frame | Snapshot at the playhead |
| ✅ | Image sequence | Numbered PNGs in a zip |
| ✅ | 720p / 1080p / 1440p / 4K | |
| ✅ | 24 / 30 / 60 fps | Also 25 / 50 in files |
| ✅ | Custom resolution | Any even height; width follows the aspect |
| ✅ | Hardware acceleration | WebCodecs uses the platform encoder where available |
| 🟡 | GPU rendering | Encoding yes; frame painting is Canvas2D (GPU-backed in Chromium) |
| ✅ | Multi-threaded rendering | Several encoders in parallel, one per physical core |
| ✅ | Render preview | Preview plays the same frame function the export uses |
| ✅ | Render progress | |
| 🟡 | Background rendering | The CLI renders headless in the background; in-app export needs the tab open |
| ✅ | Render queue | `drawflow render a.json b.json …` |
| ✅ | Cancel render | |
| ⬜ | Resume render | |
| ✅ | Headless rendering | Headless Chrome via the CLI |
| ✅ | CLI rendering (`drawflow render project.drawflow.json`) | |
| ✅ | Render only selected scene | |
| ✅ | Low-quality preview mode | View menu |
| ✅ | Plugin exporters | Post-export actions from plugins |

## 12. Project system

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | `.drawflow` project format | `.drawflow.json`, single self-contained file |
| ✅ | Human-readable JSON | |
| ✅ | Autosave | 1.5 s after each change, with thumbnail |
| ✅ | Project recovery | Last open project restored |
| ✅ | Project backups | Versions every few minutes (25 kept) |
| ✅ | Version history | Ctrl+S — named versions, restore |
| ✅ | Import / export project | Open file (as a new project) / Save to file |
| ✅ | Project validation | JSON Schema + tolerant validator that reports fixes |
| ✅ | Missing asset detection / relink | Not needed — every asset is embedded |
| ✅ | Portable projects | |
| ✅ | Multiple projects | Projects dialog with thumbnails, duplicate, delete |

## 13. Templates

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Blank project | |
| ✅ | Explainer / YouTube intro / Educational / Product demo / Business presentation / Social media / Training video / Marketing video | Eight built-in, scripted from the library; `examples/` has them as files |
| ✅ | Save scene as template | |
| ✅ | Save project as template | |
| 🟡 | Community templates | Share template files; no hosted gallery |

## 14. Collaboration

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Local-first, no account, no tracking | |
| ⬜ | Comments / share links / teams / live editing / cloud | Needs a server — intentionally out of scope |

## 15. AI

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Bring-your-own-key: Anthropic, OpenAI, Groq, Gemini | Keys stay in the browser |
| ✅ | Script → scenes | "Script → scribe": 3–6 scenes with transitions |
| ✅ | Script → suggested assets | Library pictures by keyword, text, drawn SVG |
| ✅ | Script → timeline | Elements chained per scene |
| ✅ | Script → narration | AI voice per scene onto the voice lane |
| ✅ | Auto scene generation | |
| ✅ | Generate SVG illustration | |
| ✅ | Image → whiteboard drawing | Offline doodle engine |
| ✅ | Auto-trace raster → SVG | |
| ✅ | Photo → cartoon | Gemini / OpenAI image models |
| ✅ | Automatic drawing order | Stroke-order modes; nearest-neighbour ordering in the doodle engine |
| ✅ | Automatic camera positions | Auto / scene framing |
| ✅ | Automatic timing | Fit to narration; sensible defaults from text length and stroke count |
| ✅ | Voice → timeline synchronisation | Whisper sentence timestamps (Groq / OpenAI) |

## 16. Keyboard shortcuts

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | |
| ✅ | Ctrl+C / Ctrl+X / Ctrl+V | |
| ✅ | Ctrl+D | |
| ✅ | Delete / Backspace | |
| ✅ | Space = play / pause | |
| ✅ | Arrow keys = nudge | 1 px; step frames with `,` `.` or when nothing is selected |
| ✅ | Shift + arrows = faster | 10 px |
| ✅ | Zoom shortcuts | Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1 |
| ✅ | Timeline shortcuts | Home / End, `,` `.`, `S` split, `M` marker |
| ✅ | Camera shortcuts | `F` frame the selection, camera framing via the palette |
| ✅ | Fullscreen preview | Shift+F |
| ✅ | Command palette | Ctrl+K; `?` lists every shortcut |

## 17. Developer / open-source

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | TypeScript types | `src/types.ts` |
| ✅ | Desktop build (Electron, Windows installer) | |
| ✅ | Documentation | README + docs/ (format, CLI, API, plugins, architecture, contributing) |
| ✅ | Project JSON schema | `schema/drawflow.schema.json` |
| ✅ | Plugin system / API | Effects, asset providers, exporters, panels; install by URL or code |
| ✅ | Custom animations | Plugin effects |
| ✅ | Custom asset providers | |
| ✅ | Custom exporters | |
| ⬜ | Custom renderers | The renderer is not swappable |
| ✅ | Custom tools | Plugin panels |
| ✅ | CLI (`create`, `preview`, `render`, `validate`, `bench`, `examples`) | |
| 🟡 | Node / Python API | Everything is reachable through `window.DrawFlow` + Playwright or the CLI; no published package |
| ✅ | Plugin SDK / docs | `docs/plugins.md`, `examples/plugins/wobble.js` |
| ✅ | Example projects | `examples/*.drawflow.json` |
| ✅ | Test projects | Ten Playwright end-to-end tests (`npm test`) |
| ✅ | Rendering benchmarks | `npx drawflow bench`, `DrawFlow.bench()` |

## 18. Professional UX

| Status | Feature | Note |
| --- | --- | --- |
| ✅ | Autosave indicator | |
| ✅ | Loading / progress indicators | |
| ✅ | Render progress | |
| ✅ | Error messages | Dialogs, confirm dialogs, validator reports |
| ✅ | Crash recovery | Last project + versions |
| ✅ | Asset search | |
| ✅ | Recent projects | Projects dialog |
| ✅ | Project thumbnails | |
| ✅ | Dark / light UI | Plus "follow system" |
| 🟡 | Customisable panels | Resizable library, inspector and timeline; no rearranging |
| ✅ | Resizable timeline | |
| ✅ | Full-screen preview | |
| ⬜ | Before / after preview | |
| ✅ | Performance statistics | fps, frame time, counts, heap |
| ✅ | Command palette | |

---

## Roadmap

### V1 — Core

| Status | Item |
| --- | --- |
| ✅ | Canvas |
| ✅ | SVG import |
| ✅ | PNG / JPG import |
| ✅ | Text |
| ✅ | Layers |
| ✅ | Basic draw animation |
| ✅ | Hand animation |
| ✅ | Basic animations |
| ✅ | Timeline |
| ✅ | Scenes |
| ✅ | Camera |
| ✅ | Audio |
| ✅ | Project save / load |
| ✅ | MP4 export |
| ✅ | 1080p |
| ✅ | Autosave |
| ✅ | Undo / redo |

### V1.5 — Make it actually good

| Status | Item |
| --- | --- |
| ✅ | Advanced timeline |
| ✅ | Audio waveform |
| ⬜ | Keyframes |
| ✅ | Easing |
| 🟡 | Camera keyframes (per-element shots) |
| ✅ | Multiple hands |
| ✅ | Better SVG path detection |
| ✅ | Asset library |
| ✅ | Templates |
| ✅ | Project recovery |
| ✅ | Fast renderer |

### V2 — Open-source differentiators

| Status | Item |
| --- | --- |
| ✅ | CLI renderer |
| ✅ | Project JSON schema |
| ✅ | Plugin system |
| ✅ | Asset-pack system |
| 🟡 | Community templates / asset packs (files can be shared; no hosted hub) |
| 🟡 | Python / Node API (via CLI / Playwright) |
| ✅ | Batch rendering |
| ✅ | GPU acceleration (encoding) |
| ✅ | Render queue |

### V3 — AI

| Status | Item |
| --- | --- |
| ✅ | Script → scenes |
| ✅ | Script → assets |
| ✅ | Script → timeline |
| ✅ | Image → whiteboard drawing |
| ✅ | Auto camera |
| ✅ | Auto timing |
| ✅ | Voice → animation sync |
| ✅ | AI SVG generation |

---

## Not built, and why

- **Collaboration** (comments, share links, teams, live editing, cloud) needs a server and accounts; the app is deliberately local-first.
- **Keyframes / curve editor** conflict with the effect-based model that keeps preview and export identical; plugins can add keyframed effects if needed.
- **Camera rotation, resume render, custom renderers, before/after preview, rigged characters** — small or unclear value against their cost; open for contributions.
