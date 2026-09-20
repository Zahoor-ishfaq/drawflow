# Scripting API — `window.DrawFlow`

The editor installs a small API on `window.DrawFlow`. The CLI, the test-suite,
the benchmark and plugins all use it; you can use it from the browser console
too.

| Member | What it does |
|---|---|
| `version` | API version string. |
| `store` | The Zustand store: `store.getState()` gives elements, project, audio clips and every action (`addElement`, `updateElement(s)`, `removeElements`, `reorder`, `select`, `group`, `setLayer`, `addScene`, `addMarker`, `play`, `setTime`, …). `store.subscribe(fn)` observes changes. |
| `ui` | Editor preferences store (theme, snapping, timeline zoom…). |
| `project` | The current project settings (read-only snapshot). |
| `elements` | Elements in play order. |
| `loadProject(json)` | Replace the open document with a `.drawflow.json` string. Resolves `{ problems }` — what the validator fixed. |
| `saveProject()` | The open document as a `.drawflow.json` string. |
| `importFile(file)` | Open a `File` as a new project (same as the menu). |
| `checkpoint()` | Save to the browser now. |
| `newFromTemplate(id)` | Build one of the built-in templates (`templates` lists them). |
| `addText(text, fontId, size, options)` | Add a text element; `options` = bold, italic, align, lineHeight, letterSpacing, rtl. |
| `addSvg(svgText, label)` | Add SVG artwork. |
| `addImage({ src, width, height }, label)` | Add a picture (data URL). |
| `render(options)` | Export: `{ format: 'mp4'\|'webm'\|'gif'\|'png-sequence'\|'png', height, scene, onProgress, signal }` → `{ blob, filename, sizeBytes, elapsedMs, engine, url }`. |
| `renderBase64(options)` | Same, with the file as base64 (for automation tools that cannot read Blobs). |
| `bench(height, seconds)` | Paint/encode throughput of this machine. |
| `plugins` | `registerEffect`, `registerAssetProvider`, `registerExporter`, `registerPanel` — see [plugins.md](./plugins.md). |
| `registry` | What plugins have registered. |

Example, in the console:

```js
await DrawFlow.newFromTemplate('explainer');
DrawFlow.store.getState().updateProject({ hand: 'pencil' });
const { blob } = await DrawFlow.render({ format: 'webm', height: 720 });
```

Node / Python users: drive the same API through the CLI
([cli.md](./cli.md)) or through Playwright as the CLI does —
`page.evaluate(() => window.DrawFlow.renderBase64({...}))`.
