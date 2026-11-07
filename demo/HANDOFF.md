# Demo mode: handoff

## Open it
Toolbar icon, then **Open demo** (or go to `chrome-extension://<id>/demo/index.html`). It needs no myGCC account and never contacts my.gcc.edu.

## How it works
- `index.html` loads the same CSS and JS as the manifest's content_scripts, with `server.js` and `shim.js` loaded first. **Keep its tag lists in step with manifest.json.**
- `server.js` stands in for JICS. `handle(method, url, body)` returns JICS-shaped HTML for any `/ICS/...` URL, including postbacks: Add/Drop search, results, details, term switching, degree requirement details, and the Add button (which does nothing in the demo). All data is fictional, and term dates are relative to today.
- `shim.js` does four things:
  - Prefixes storage keys with `demo:` (except `settings` and `ai`).
  - Serves `fetch('/ICS/...')` from `server.js` and blocks any `*.gcc.edu` request.
  - Turns clicks, submits and autopostback selects into demo navigations: `index.html?u=<myGCC URL>`, with the POST body carried in sessionStorage.
  - Returns a sample dining menu, sets `__gccxDryRun`, draws the always-on banner, and seeds the welcome screen plus next term's registered classes.
- `chapel.html` is the chapel frame; the real `src/chapel.js` reads it.
- Changes to production scripts all go through `GCCX.loc()` / `GCCX.go()` / `GCCX.demo` in lib.js. These are the real `location` / plain navigation unless `window.__gccxDemo` is set on an extension page:
  - content.js: isHome, scrapeCurrentPage, and palette navigation.
  - degree.js: page check and the prefill navigation.
  - builder.js: goMain, and the dry-run message text.
  - links.js: prerender is skipped in the demo.
- CSP: `javascript:__doPostBack` links are rewritten to `href="#"` plus `data-demo-postback` when a page is drawn (done). Fetched pages keep the JICS form; they are only parsed.

## Verified
Tested in an isolated Playwright Chromium with the extension unpacked, driven over CDP:
- Dashboard: classes, registration card, hero stats, chapel via the frame, dining, and at-a-glance.
- Ctrl K with the content index (38 pages).
- Add/Drop: fit and conflict tags, Save lock, ghost blocks, details page, and the Register-all dry run.
- Degree roadmap and Find open sections.
- Schedule page, dark mode, welcome screen, and the storage namespace.
- No console errors, and no `javascript:` hrefs left on screen.

## Not verified / left
- Plan with AI and Ask AI with a real key (no key available). The code path is the normal background `ai-chat` path.
- The popup button in a real Chrome. Claude in Chrome can't open chrome-extension:// pages.
- Find open sections for in-progress courses (for example HUMA 210) finds no sections. Only the required courses are in next term's catalog.
- On first install, background.js still opens my.gcc.edu (reviewers will see the college login). Consider opening the demo when no myGCC tab exists, or leave it.
- Cosmetic: the plan drawer covers the avatar circle.

## v1.1.0 continuation (2026-11-06)
- Manifest asset parity restored, including loading, forums, Quick Links and home portlets.
- Home has fictional event/announcement fixtures. Need help includes a link to sample Forums (Main, TopicView, PostView, AddPost); posts are never saved or sent.
- Forums and What's New now honor the demo's virtual URL.
- Feedback copies the note (and optional screenshot) and opens Telegram or an email draft; nothing is sent automatically.
- Browser QA harness: `node store/src/qa-release.cjs` from the workspace root. Output images live in store/qa and are not packaged.
- Live JICS pagination, resource toggles, authenticated registration dry run and actual form submission still need real-browser verification.

### Theme and campus-hours additions
- Demo loads compiled theme catalog/runtime, shared fonts/tokens and facility data in production order.
- All 35 campus facilities use the published student-facing source; hours are not sample student data. No authenticated source page is fetched in the background.
- Theme browser tests: `node store/src/qa-themes.cjs`. Tests cover hierarchy, custom install/editor/export, reload persistence, disable/enable behavior and responsive views.
- The top chapel statistic is intentionally absent per user request; At a glance retains chapel attendance.
