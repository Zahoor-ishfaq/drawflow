# DrawFlow MCP server

Lets an AI assistant (Claude Desktop, Claude Code or any MCP client) make
whiteboard-animation videos end to end, without opening the editor: create a
project, add scenes of hand-drawn text, SVG, pictures and photos, narrate them,
check frames and render the MP4.

It runs locally over **stdio**. Projects are ordinary `.drawflow.json` files,
so anything the assistant makes can be opened and polished in the DrawFlow
editor, and the editor's projects can be rendered by the assistant.

## The easy way: install DrawFlow (Windows)

No Node.js, no terminal, no config files.

1. Download **DrawFlow-Setup** from the
   [latest release](https://github.com/Zahoor-ishfaq/drawflow/releases/latest)
   and install it.
2. Open DrawFlow and click **Connect AI (MCP)** at the top of the window. It
   adds DrawFlow to Claude Desktop, Cursor and Windsurf if they are on this computer.
   Your other settings are left alone, and a copy of each file is kept as
   `<file>.before-drawflow`.
3. Restart your AI app and ask for a video:

   > Make a 9:16 whiteboard video about how a seed becomes a tree.

For any other MCP app, choose **Copy settings** in the same dialog and paste
them into that app's MCP settings. For Claude Code, run this (with your own
install folder):

```bash
claude mcp add drawflow -e ELECTRON_RUN_AS_NODE=1 -- "C:\Users\you\AppData\Local\Programs\DrawFlow\DrawFlow.exe" "C:\Users\you\AppData\Local\Programs\DrawFlow\resources\app.asar\electron\mcp\server.cjs"
```

Rendering uses Microsoft Edge or Google Chrome, and every Windows 10 or 11 PC
has Edge. The portable exe can't be connected, because it runs from a temporary
folder: use the Setup file.

## How it works

The server keeps one headless DrawFlow open (the same session the
[`drawflow render`](../docs/cli.md) command uses) and does all its work through
the app's own scripting API, [`window.DrawFlow`](../docs/api.md). Text becomes
handwriting, SVG is imported, pictures are placed, narration is fitted and
video is encoded by exactly the code the editor uses, so nothing is
re-implemented. Text voiceovers use DrawFlow's built-in offline voice
(Kokoro-82M): free, no API key, nothing sent to the internet.

## From source (macOS, Linux, or to change the code)

Requirements:

- **Node.js 20+**
- **Google Chrome or Microsoft Edge** (or Playwright's Chromium:
  `npx playwright install chromium`)
- About 100 MB free for the voice model, downloaded once the first time a text
  voiceover is made

Install:

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

### Add it to Claude Desktop

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

### Add it to Claude Code

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
| `add_motion_path(project, scene, item?, points, duration?, delay?, easing?, orient?, facing?, straight?)` | Makes one item of a scene travel along a route after it appears — for example an animated GIF of a bird flying across the board while it flaps. `points` are `[x, y]` offsets in pixels from the item's centre; with `orient` it turns so its front (`facing`: right, left, up or down) points along the route. An empty `points` list removes the path. |
| `set_subtitles(project, show?, font?, size?, position?, color?, box?)` | Turns subtitles on or off and sets how they look. Voiceover text becomes subtitles timed to the voice. |
| `import_subtitles(project, path)` | Uses an `.srt` or `.vtt` file for the whole video. |
| `get_preview(project, scene?, time?, height?)` | A PNG frame: the moment a scene is fully drawn, or any time. |
| `render(project, output_path?, format?, height?, scene?)` | Renders MP4 (or WebM / GIF) with audio. Default output: next to the project file. When the project has subtitles, an `.srt` is written beside the video. |
| `check_job(job?)` | The result of a render or voiceover that is still working (see below). |
| `list_projects()` | Projects in the projects folder. |
| `get_project(project)` | Settings, scenes with timing, items and voiceovers, total length. |
| `list_voices()` | The built-in voices (15 English voices, US and UK). |

An animated GIF given as a picture in `add_scene` plays inside the video. To get
subtitles for your own audio, give `add_voiceover` both `audio_path` and `text`.

`project` can be the title, the file name or a full path, so projects saved
from the editor work too. Scenes are named, numbered from 1, or given by id.

The server also gives the assistant instructions on making a good video, and a
`make_whiteboard_video` prompt (topic, format, length) for clients that show
prompts.

### Long jobs

Most clients give up on a tool call after about a minute, and a render or the
voice model's first download can take longer. So `render` and `add_voiceover`
answer within 30 seconds: with the result, or with `status: "working"` and a job
id. The work carries on in the background, and `check_job` returns its progress
and then its result. Clients that support progress notifications also get those
during a render.

## Example

Ask the assistant something like:

> Make a 3-scene whiteboard video explaining how a seed becomes a tree, 1080p.
> Use library pictures, narrate each scene, show me a preview of each scene,
> then render it to my Desktop.

It will call `create_project`, then `add_scene` and `add_voiceover` for each
scene, `get_preview` to check the layout, and finally `render`.

## Troubleshooting

- **DrawFlow doesn't appear in your AI app**: restart the AI app after
  connecting. Claude Desktop must be fully quit, from the tray icon too.
- **"dist/ not found"** (from source): run `npm run build` in the DrawFlow folder.
- **"No Chromium-based browser found"**: install Chrome or Edge, or set
  `DRAWFLOW_BROWSER`. From source, `npx playwright install chromium` also works.
- **The first text voiceover takes a while**: the voice model (~92 MB) is
  being downloaded; later voiceovers take seconds.
- **Render time**: roughly real time or faster for 1080p, more for 4K.
  Clients that support progress notifications see the percentage.
- Logs go to stderr (the protocol uses stdout). In Claude Desktop they are in
  the MCP log files (Settings → Developer).
