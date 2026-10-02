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
| `render(options)` | Export: `{ format: 'mp4'\|'webm'\|'gif'\|'png-sequence'\|'png', height, scene, onProgress, signal }` → `{ blob, filename, sizeBytes, elapsedMs, engine, url }`. `height` defaults to the project's `exportHeight`, else 1080. |
| `renderBase64(options)` | Same, with the file as base64 (for automation tools that cannot read Blobs). |
| `newProject(settings)` | Start an empty project: `{ name, width, height, fps, exportHeight, paper, hand }`. |
| `addScene(options)` | Append a scene of content: `{ name, items, drawDuration, holdDuration, transition }`, items being `{ type: 'text', text, size }`, `{ type: 'svg', svg, label }`, `{ type: 'image', base64, mime, name }` or `{ type: 'library', query, color }`. The scene gets its own part of the board and clears it; items are placed by the editor's own layout. Resolves `{ id, name, elements, start, end }`. |
| `addVoiceover(options)` | Narrate a scene: `{ scene, audio: { base64, mime, name } }` or `{ scene, text, voice }` (built-in voice, desktop app or MCP server only), `fit` (default true) retimes the scene's drawing to the narration as Script → scribe does; later scenes' voiceovers move with them. |
| `describe()` | The open project as a plain summary: settings, scenes with timing, items and voiceovers. |
| `previewBase64({ scene, time, height })` | One PNG frame (base64): the moment a scene is fully drawn, or the frame at `time`. |
| `voices` | The built-in voice's speakers (`{ id, label }`). |
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
`page.evaluate(() => window.DrawFlow.renderBase64({...}))`. AI assistants can
use it through the [MCP server](../mcp/README.md).
