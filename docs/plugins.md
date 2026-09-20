# Plugins

A plugin is a plain ES module. Install it under **View → Plugins…** from a URL
or by pasting its code; installed plugins are remembered in this browser and
loaded at startup. Plugins run with full access to the page — install only code
you trust.

```js
export default {
  id: 'example.wobble',          // unique, stable
  name: 'Wobble effects',
  setup(api) {                   // api === window.DrawFlow
    api.plugins.registerEffect({
      kind: 'emphasis', id: 'wobble', label: 'Wobble',
      frame: ({ p, base }) => ({ rotate: base.rotate + Math.sin(p * Math.PI * 4) * 6 }),
    });
  },
};
```

## What a plugin can register

### Effects — `registerEffect({ kind, id, label, frame })`

`kind` is `entrance`, `emphasis` or `exit`. The effect appears in the
Animation inspector under that heading (as `label (plugin)`) and is stored on
elements as `plugin:<id>`, so exports and the CLI render it identically.

`frame(args)` is called for every frame the effect is active and returns a
partial [`ElementFrame`](../src/lib/renderFrame.ts) to merge:

| Argument | Meaning |
|---|---|
| `el` | the element |
| `p` | progress 0..1 — through the entrance, through the current emphasis repeat, or through the exit |
| `t` | timeline time in seconds |
| `base` | the frame before your effect (for emphasis/exit: the fully drawn element) |
| `view` | camera frame in canvas units (entrance/exit) |
| `bounds` | element bounds in its local units |

Useful frame fields: `groupOpacity`, `fillOpacity`, `dx`, `dy` (canvas units),
`scale`, `rotate` (degrees), `clip` (local rect), `highlight` (0..1),
`visibleCount` (sub-paths shown), `dashes` (per-path dash state for draw-style
reveals — see `dashPropsAt` in `src/lib/drawing.ts`).

### Asset providers — `registerAssetProvider({ id, label, search })`

`search(query)` resolves with `[{ id, name, svg? , imageUrl?, width?, height? }]`.
Results appear in the Images panel under *From plugins* while searching;
choosing one adds the SVG text or the picture to the canvas.

### Exporters — `registerExporter({ id, label, run })`

`run(result, blob)` is called with the [`ExportResult`](../src/lib/exportVideo.ts)
and the file when the user presses your button after an export — upload it,
post it, convert it.

### Panels — `registerPanel({ id, label, mount })`

Adds a tool to the left rail. `mount(hostElement)` renders whatever you like
into a plain element (no framework required) and may return a cleanup function.

## The API object

`setup` receives `window.DrawFlow` — see [api.md](./api.md). The most useful
parts inside a plugin: `api.store.getState()` (elements, project, actions such
as `addElement`, `updateElements`, `select`), `api.addText`, `api.addSvg`,
`api.addImage`, `api.render`.

## Sharing plugins

Host the module anywhere that serves JavaScript with CORS (a GitHub Pages
site, a CDN, your own server) and share the URL. Plugins are versionless by
design: bump `id` if you make an incompatible change.
