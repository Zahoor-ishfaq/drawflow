# DrawFlow MCP server

Lets an AI assistant (Claude Desktop, Claude Code or any MCP client) make
whiteboard-animation videos end to end, without opening the editor: create a
project, add scenes of hand-drawn text, SVG, pictures and photos, narrate them,
check frames and render the MP4.

It runs locally over **stdio**. Projects are ordinary `.drawflow.json` files,
so anything the assistant makes can be opened and polished in the DrawFlow
editor, and the editor's projects can be rendered by the assistant.

## How it works

The server keeps one headless DrawFlow open (the same session the
[`drawflow render`](../docs/cli.md) command uses) and does all its work through
the app's own scripting API, [`window.DrawFlow`](../docs/api.md). Text becomes
handwriting, SVG is imported, pictures are placed, narration is fitted and
video is encoded by exactly the code the editor uses, so nothing is
re-implemented. Text voiceovers use DrawFlow's built-in offline voice
(Kokoro-82M): free, no API key, nothing sent to the internet.

## Requirements

- **Node.js 20+**
- **Google Chrome or Microsoft Edge** (or Playwright's Chromium:
  `npx playwright install chromium`)
- About 100 MB free for the voice model, downloaded once the first time a text
  voiceover is made

## Install

```bash
git clone https://github.com/Zahoor-ishfaq/drawflow.git
cd drawflow
npm install
npm run build        # the server drives the built app in dist/
npm run test:mcp     # optional: builds and renders a 3-scene sample video
```

`npm run test:mcp` starts the server, calls every tool through a real MCP
client and checks the result (picture size, length, audible narration). The
sample project, preview frames and `smoke-test.mp4` are left in your temp
folder (`drawflow-mcp-test`) so you can look at them.

## Add it to Claude Desktop

Open **Settings → Developer → Edit Config**, or edit the file directly:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add DrawFlow under `mcpServers`, using the full path to your clone:

```json
{
  "mcpServers": {
    "drawflow": {
      "command": "node",
      "args": ["C:\\Users\\you\\drawflow\\mcp\\server.mjs"],
      "env": {
        "DRAWFLOW_PROJECTS": "C:\\Users\\you\\Documents\\DrawFlow"
      }
    }
  }
}
```

On macOS or Linux the path looks like `"/Users/you/drawflow/mcp/server.mjs"`.
The `env` block is optional. Restart Claude Desktop; the DrawFlow tools appear
in the tools menu.

## Add it to Claude Code

```bash
claude mcp add drawflow -- node /path/to/drawflow/mcp/server.mjs
```

Add `--scope user` to have it in every project, and `-e KEY=value` for the
settings below, for example:

```bash
claude mcp add drawflow --scope user -e DRAWFLOW_PROJECTS=/path/to/videos -- node /path/to/drawflow/mcp/server.mjs
```

Or share it with a repository through a `.mcp.json` file at its root:

```json
{
  "mcpServers": {
    "drawflow": { "command": "node", "args": ["/path/to/drawflow/mcp/server.mjs"] }
  }
}
```

Check it with `claude mcp list` or `/mcp` inside Claude Code.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DRAWFLOW_PROJECTS` | `~/Documents/DrawFlow` | Where projects are kept (`<title>.drawflow.json`). |
| `DRAWFLOW_MODELS` | the desktop app's folder (`%APPDATA%\drawflow\models` on Windows) | Where the voice model is stored; shared with the desktop app, so it is downloaded only once. |
| `DRAWFLOW_BROWSER` | Chrome, then Edge, then Playwright's Chromium | A specific Chromium-based browser executable. |

## Tools

| Tool | What it does |
|---|---|
| `create_project(title, resolution, fps, paper?)` | New empty project. `resolution`: `720p`, `1080p`, `1440p`, `4k`, `vertical` (1080x1920), `square` or `WIDTHxHEIGHT`; `fps`: 24/25/30/50/60. |
| `add_scene(project, content, draw_duration?, hold_duration?, name?, transition?)` | Appends a scene. `content` is one item or a list of up to 6: `{type:"text", text, size?}`, `{type:"svg", svg \| path}`, `{type:"image", path}`, `{type:"library", query}` (5,000+ built-in drawings). Each scene gets its own part of the board; the camera moves there and the board is cleared. |
| `add_voiceover(project, scene, text \| audio_path, voice?, fit_drawing?)` | Narrates a scene from text (built-in voice) or an audio file (WAV, MP3, M4A, OGG, FLAC, WebM). By default the drawing is retimed so each item is drawn while its phrase is spoken; later scenes and their voiceovers move along. |
| `get_preview(project, scene?, time?, height?)` | A PNG frame: the moment a scene is fully drawn, or any time. |
| `render(project, output_path?, format?, height?, scene?)` | Renders MP4 (or WebM / GIF) with audio, reporting progress. Default output: next to the project file. |
| `list_projects()` | Projects in the projects folder. |
| `get_project(project)` | Settings, scenes with timing, items and voiceovers, total length. |
| `list_voices()` | The built-in voices (15 English voices, US and UK). |

`project` can be the title, the file name or a full path, so projects saved
from the editor work too. Scenes are named, numbered from 1, or given by id.

## Example

Ask the assistant something like:

> Make a 3-scene whiteboard video explaining how a seed becomes a tree, 1080p.
> Use library pictures, narrate each scene, show me a preview of each scene,
> then render it to my Desktop.

It will call `create_project`, then `add_scene` and `add_voiceover` for each
scene, `get_preview` to check the layout, and finally `render`.

## Troubleshooting

- **"dist/ not found"**: run `npm run build` in the DrawFlow folder.
- **"No Chromium-based browser found"**: install Chrome or Edge, run
  `npx playwright install chromium`, or set `DRAWFLOW_BROWSER`.
- **The first text voiceover takes a while**: the voice model (~92 MB) is
  being downloaded; later voiceovers take seconds.
- **Render time**: roughly real time or faster for 1080p, more for 4K.
  Clients that support progress notifications see the percentage.
- Logs go to stderr (the protocol uses stdout). In Claude Desktop they are in
  the MCP log files (Settings → Developer).
