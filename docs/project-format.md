# The `.drawflow.json` project format

A DrawFlow project is one JSON file. Everything the video needs is inside it —
element artwork as SVG path data, pictures and audio as `data:` URLs — so a
file can be copied, versioned, mailed or rendered on another machine with no
side folder of assets. The formal description is
[`schema/drawflow.schema.json`](../schema/drawflow.schema.json) (JSON Schema
draft-07); this page explains the ideas behind it.

```jsonc
{
  "app": "drawflow",
  "format": 2,
  "savedAt": 1789900000000,
  "project": { /* settings, scenes, markers, custom hands and fonts */ },
  "elements": [ /* what gets drawn, in play order */ ],
  "audioClips": [ /* clips on the music / voice / sfx lanes */ ],
  "sources": [ /* audio files the clips reference, base64 */ ]
}
```

## Project

| Field | Meaning |
|---|---|
| `width`, `height`, `fps` | Video size and frame rate (24/25/30/50/60). |
| `background`, `paper` | Paper colour and style (`plain`, `grid`, `dots`, `lined`, `cream`, `chalkboard`, `kraft`). |
| `hand` | Default hand: `marker`, `pen`, `chalk`, `pencil`, `brush`, `eraser`, `none` or `custom:<id>`. |
| `cameraEasing`, `cameraFill`, `zoomAtEnd`, `endHold` | Camera behaviour; `duration` is derived and recomputed on load. |
| `scenes[]` | `{ id, name, transition: cut|fade|wipe, transitionDuration, clearBefore?, paper?, background? }`. Elements point at a scene by `sceneId`; scene order is the element order. |
| `markers[]` | `{ id, time, name, color }` on the timeline ruler. |
| `handOffset`, `handSmoothing` | Hand picture nudge and motion smoothing. |
| `customHands[]`, `fonts[]` | Uploaded hand photos (with pen tip) and TTF/OTF fonts, embedded. |

## Elements

Elements play one after another in `zIndex` order. Each element's `startTime`
is **derived** from the sequence: it starts when the previous element's slot
(draw + emphasis + pause) has ended, plus its own `transitionIn`. An element
with `withPrevious: true` starts together with the one before it. Hidden
elements take no time and are not rendered.

| Field | Meaning |
|---|---|
| `kind` | `text`, `shape`, `svg` or `image`. |
| `paths[]` | SVG path `d` strings in the element's local units. For images this is the scribble path the hand follows. |
| `pathFills[]`, `pathStrokes[]`, `fillRule` | Per-path colours for imported coloured artwork. |
| `x`, `y`, `scale`, `rotation`, `flipX`, `flipY`, `opacity`, `crop` | Transform. |
| `drawDuration`, `pauseAfter`, `transitionIn` | Animate / Pause / Transition, in seconds. |
| `style` | Entrance: `draw`, `appear`, `fade`, `slide`, `wipe`, `scale`, `pop`, `bounce`, `typewriter` or `plugin:<id>`. `slideFrom` and `easing` refine it. |
| `strokeOrder`, `revealMode` | How the hand draws vector art / reveals a photo. |
| `emphasis` | `{ kind, duration, delay, repeat }` played after drawing; the next element waits for it. |
| `exit` | `{ kind, duration, delay, direction }` played `delay` seconds after the element's slot; later elements keep drawing meanwhile. |
| `camera`, `cameraZoom`, `customCamera` | Framing while the element draws: `auto`, `previous`, `custom`, `scene`, `whole`. |
| `hand` | Per-element hand override. |
| `layer` | Stacking offset on top of play order. |
| `groupChildren[]` | The elements a group was made from (for ungroup). |
| `text`, `fontSize`, `fontFamily`, `fontWeight`, `italic`, `align`, `lineHeight`, `letterSpacing`, `rtl` | Text metadata used to regenerate the glyph paths. |
| `image` | `{ src: data URL, width, height }` for `kind: image`. |

## Audio

`audioClips[]` place pieces of a source on a lane (`music`, `voice`, `sfx`):
`startTime` on the timeline, `offset` into the source, `duration`, `volume`
(0–1.5), `fadeIn`/`fadeOut`, `muted`, `solo`, optional `sceneId` (the clip
moves with the scene). `sources[]` hold the bytes: `{ id, name, type, data }`.

## Compatibility

Files are validated on open: missing fields get defaults, unusable elements
are dropped, duplicate ids are fixed, and the list of fixes is shown. `format`
is 2; format-1 files (single-checkpoint era) open unchanged.
