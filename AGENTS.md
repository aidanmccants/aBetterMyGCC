# Notes for anyone (or any agent) changing this extension

Plain JavaScript, no build step, no runtime dependencies. Each file in `src/` is an IIFE; shared helpers are on `window.GCCX` (`src/lib.js`, `src/machines.js`).

## Tests
- Run `npm test` (which runs `node --test tests/`). No install needed.
- Run `npm run check` too (`scripts/check.js`): syntax, manifest files, script lists, `DEFAULTS`, versions. CI runs both and must pass.
- Release with `npm run release -- patch` (see README, Development / Releasing). Do not edit the version by hand in only one of `manifest.json` / `package.json`.
- `tests/helpers.js` loads the browser scripts unchanged. State tables are written out by hand in their tests, so a table change must be made in both places.

## Seeing state while it runs
- Elements carry `data-gccx-state`: the plan drawer, dashboard cards, the Plan with AI panel, the Ask AI answer box, the AI section of Settings.
- The Logs page (`logs/log.html`, Settings > Help > Open live log) shows every state change under **State changes**.
- Tables and diagrams: `docs/STATE_MACHINES.md`.

## Rules that are easy to break
- **`DEFAULTS` is duplicated in four files**: `src/content.js`, `src/onboarding.js`, `options/options.js`, `popup/popup.js`. Change all four together.
- **Script lists must match**: `manifest.json` `content_scripts`, `demo/index.html`, and `FILES` in `src/devreload.js`.
- **Escape everything rendered.** Anything from myGCC, Nutrislice or an AI model goes through `esc()` before `innerHTML`, or use `textContent`.
- **Never touch Drop.** Registration needs two clicks (Register all, then Register) and never touches Drop checkboxes. Only a `register` job can reach the Add Course(s) click.
- **URLs the extension fetches by itself go through `GCCX.safeUrl`.**
- **No content script reads the `ai` storage record** (`tests/aikey.test.js`).
- Keep existing `chrome.storage.local` and `sessionStorage` key names. If a stored shape changes, convert old values when they are read.
- No new permissions, dependencies, bundlers or frameworks.

## Testing in a browser
Test in the demo, never against live my.gcc.edu: Settings > Help > Open demo, or `chrome-extension://<id>/demo/index.html`. Read `demo/HANDOFF.md` first.
