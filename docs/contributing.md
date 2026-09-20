# Contributing

```bash
npm install
npm run dev          # editor with hot reload at :5173
npx tsc --noEmit     # strict type-check
npm run build        # production build
npm test             # end-to-end tests in your Chrome/Edge (DRAWFLOW_BROWSER=chrome|msedge)
npx drawflow bench   # export throughput on this machine
```

## Ground rules

- **Rendering is a pure function of time.** Anything that affects the picture
  goes through `renderFrame.ts` (and its Canvas2D twin `canvasRender.ts`), so
  the live canvas, the export and the CLI stay identical. Never draw something
  only in the React canvas.
- **Timing is derived.** Don't write `startTime` by hand; change the sequence
  or an element's Animate / Pause / Transition and let `rechain()` do the rest.
- **Document state lives in the store, and only document state is undoable.**
  Editor preferences go in `uiStore`; big blobs (decoded audio) live beside the
  store, referenced by id.
- **Local first.** No network calls except the AI providers the user chose,
  with the user's own key.
- **Files stay readable.** Extend the model with optional fields; the validator
  supplies defaults for older files. Update `schema/drawflow.schema.json` and
  `docs/project-format.md` with any change.

## Adding an effect

1. Add the kind to `types.ts` (`DrawStyle`, `EmphasisKind` or `ExitKind`).
2. Implement it in `renderFrame.ts` — `entranceFrame`, `applyEmphasis` or
   `applyExit` — using only `ElementFrame` fields (the Canvas2D painter already
   honours all of them).
3. List it in `AnimationSection.tsx` and the command palette.
4. Add a case to `tests/` if it changes timing.

Or write it as a plugin first ([plugins.md](./plugins.md)) — plugins use the
same `ElementFrame` contract.

## Adding a library category, template or hand

- Library: `public/library/` + `index.json` (see `CREDITS.md` for licences).
- Templates: `src/assets/templates.ts` — scripts of text and library picture ids.
- Hands: photographs go in `src/assets/hands/` with a `HandDef` (pen tip and
  sleeve geometry); cartoon hands are SVG in `cartoonHands.ts`.

## Style

Two-space TypeScript, strict mode, no default exports for components, comments
that explain *why*. Commit messages describe the user-visible change first.
