# Command line

`drawflow` renders, previews, validates and benchmarks projects without the
editor. It serves the built app from `dist/` on a local port and drives a
headless Chromium-based browser through `window.DrawFlow`, so the output is
identical to the editor's Export button (same renderer, same encoders).

## Requirements

- `npm run build` once (the CLI needs `dist/`).
- Google Chrome, Microsoft Edge, or Playwright's Chromium
  (`npx playwright install chromium`). Pass `--browser <path>` to use a
  specific executable.

## Commands

```bash
npx drawflow create <name>                # empty <name>.drawflow.json
npx drawflow render <file...> [options]   # one or more projects, in order
npx drawflow preview <file>               # open in a browser window and play
npx drawflow validate <file...>           # list what the loader would fix
npx drawflow bench [--height 1080] [--json]
npx drawflow examples [dir]               # write the built-in templates as files
```

Render options:

| Option | Meaning |
|---|---|
| `-o, --out <path>` | Output file; with several inputs, a folder. Default: next to the project. |
| `--format mp4\|webm\|gif\|png-sequence` | Default `mp4`. |
| `--height <px>` | 720, 1080, 1440, 2160 or any even number. Width follows the project aspect. |
| `--scene <name>` | Render one scene only. |
| `--lanes <n>` | Concurrent encoders (default: physical cores). |
| `--keep-open` | Leave the browser open for debugging. |

## Batch rendering and CI

Several files render in one browser session:

```bash
npx drawflow render episodes/*.drawflow.json --format mp4 --height 1080 -o build/
```

In CI, install the package and a browser, build, and render:

```yaml
- run: npm ci && npm run build
- run: npx playwright install chromium
- run: npx drawflow render examples/explainer.drawflow.json -o out/explainer.mp4
```

Headless Chromium uses software encoders, so expect roughly real-time speed
for 1080p on a two-core runner and better with more cores.

## Exit codes

`0` on success; `1` with a message on a missing build, no browser, an invalid
file or a render error.
