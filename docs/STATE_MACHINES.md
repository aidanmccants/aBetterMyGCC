# State machines

Every machine below is a table in `src/machines.js`, driven by `GCCX.machine(name, { initial, states, el })` from `src/lib.js`.

- `send(event)` moves only along the table. A move the table lacks is refused: the state stays, and a warning goes to the Logs page.
- Every move is logged as `name: from → to` under the source **State changes** on the Logs page (`logs/log.html`).
- Where an element is given, it carries `data-gccx-state` with the current state.
- Tests: `npm test` (`tests/*.test.js`). Each table is written out by hand in its test, so changing a table means changing the test on purpose.

## 1. Batch registration job

Owner: `src/builder.js`. Table: `GCCX.machines.jobStates(mode)`. Storage: `chrome.storage.local` key `job`. Element: `#gccx-plan`.

`job.mode` says what the job may do. `job.state` says where it is.

| Mode | Does |
|---|---|
| `register` | looks up reference numbers, fills the six boxes, presses Add Course(s) |
| `fill` | looks up, fills the boxes, stops ("Load my plan") |
| `lookup` | looks up reference numbers only |
| `lookupStay` | looks up one course and stays on its details page ("Get course number") |

```
lookup.search --SEARCH--> lookup.results --OPEN--> lookup.details --REF--> lookup.search
      |  ^                      |                         |
      |  +---- MISSING / LOST --+------------ LOST -------+
      |
      +--REFS_DONE--> done.ok                (lookup, lookupStay)
      +--REFS_DONE--> submit.fill            (register, fill)

submit.fill --TERM--> submit.term --SWITCHED / LOST--> submit.fill
submit.fill --FILLED / NOTHING--> done.ok
submit.fill --SEND--> submit.sent            (register only: this is the Add Course(s) click)
submit.sent --JUDGED--> submit.fill          (next batch of six)
submit.sent --OFFPAGE--> submit.verify --JUDGED / LOST--> submit.fill

any working state --STOP--> done.stopped | --FAIL--> done.failed | --ABANDON--> done.abandoned
```

| State | Meaning | Allowed moves |
|---|---|---|
| `lookup.search` | on Add/Drop, about to search for the next course | SEARCH, SKIP, REFS_DONE, STOP, FAIL, ABANDON |
| `lookup.results` | search sent, results expected | OPEN, MISSING, LOST, STOP, FAIL, ABANDON |
| `lookup.details` | course opened, details expected | REF, LOST, STOP, FAIL, ABANDON (plus REFS_DONE in `lookupStay`) |
| `submit.fill` | about to fill the reference boxes | TERM, FILLED, NOTHING, STOP, FAIL, ABANDON (plus SEND in `register`) |
| `submit.term` | Your Schedule term switched, page reloading | SWITCHED, LOST, STOP, FAIL, ABANDON |
| `submit.sent` | Add Course(s) pressed | OFFPAGE, JUDGED, STOP, FAIL, ABANDON |
| `submit.verify` | result came back elsewhere; checking Your Schedule | JUDGED, LOST, STOP, FAIL, ABANDON |
| `done.ok` | ran to its end | none |
| `done.stopped` | stopped itself on a known problem | none |
| `done.failed` | an exception | none |
| `done.abandoned` | left for more than 10 minutes | none |

Safety properties (tested in `tests/job.test.js`):
- `lookup` and `lookupStay` have no `submit.*` states at all.
- Only `register` has SEND. If SEND is refused, the Add button is never clicked.
- An unknown mode gets the `lookup` table.

Old data: jobs saved with `phase` / `step` / `fillOnly` / `lookupOnly` / `stayOnDetails` are converted by `upgradeJob` when read, and saved in the new shape by the next `saveJob`.

Abandoned jobs are kept, not deleted. The drawer lists each course as added, not added, sent but not checked, reference number only, or not looked up. Dismiss and Stop clear the job.

## 2. Dashboard data

Owner: `src/content.js`. Table: `GCCX.machines.card`. One machine per source: `schedule`, `degree`, `standing`, `registration`, `chapel`, `balance`, `menu`, `forums`. Storage: the cache keys of the same names (`menu:*` for dining; `forums` is written by `campusfeed.js`). The dashboard is on My Info only. Element: each `.x-card`, plus `.x-progress-wrap` and `.x-foot`, show the combined status.

```
loading --LOADED--> ready
loading --EMPTY--> empty
loading --STALE--> stale        (refresh failed, saved copy shown with its age)
loading --FAILED--> error       (refresh failed, nothing saved)
ready / empty / stale / error --REFRESH--> loading
loading / empty / stale / error --ARRIVED--> ready   (chapel numbers arrive from a frame)
```

`cached()` returns the same data as before and records how it got it in `cached.info[key]`: `{}`, `{ stale, ts }` or `{ failed }`.

## 3. AI key setup

Owners: `options/options.js` (table `GCCX.machines.aiSetup`, element `#ai`) and `src/background.js` (`aiState()`). Storage: `chrome.storage.local` key `ai`, plus Chrome's optional host permission for the provider.

| State | Meaning | Allowed moves |
|---|---|---|
| `none` | no key saved | SAVE, CLEAR |
| `verifying` | asking Chrome for access, then checking the key (Settings page only) | DENIED, REJECTED, VERIFIED, CLEAR |
| `needs-permission` | key saved, access denied or switched off | SAVE, ALLOW, CLEAR |
| `invalid` | provider rejected the key or returned no models (Settings page only) | SAVE, CLEAR |
| `needs-model` | key and access fine, no model chosen | SAVE, PICK, REVOKED, CLEAR |
| `ready` | usable | SAVE, PICK, REVOKED, CLEAR |

```
none --SAVE--> verifying --VERIFIED--> ready
                   |--DENIED--> needs-permission --ALLOW / SAVE--> verifying
                   |--REJECTED--> invalid --SAVE--> verifying
needs-model --PICK--> ready      ready / needs-model --REVOKED--> needs-permission
any state --CLEAR--> none
```

The background answers `none | needs-permission | needs-model | ready` for both `ai-status` and `ai-chat`, so a page can never be told "ready" and then be refused for a different reason.

### AI key storage

The key is in `chrome.storage.local`, which Chrome lets content scripts read by default. No content script reads it (`tests/aikey.test.js` fails if one starts to). Open decision for the maintainer: moving the key to `chrome.storage.session` would make the browser enforce this, but the key would have to be typed again after every browser restart.

## 4. AI runs

Owners: Plan with AI in `src/builder.js` (machine `plan-ai`, element `#gccx-plan .x-ai`) and Ask AI in `src/content.js` (machine `ask-ai`, element `#gccx-palette .x-answer`). Table: `GCCX.machines.aiRun`. Storage: Plan with AI saves its run in `sessionStorage` key `gccx-ai-run` after every turn; Ask AI stores nothing.

| State | Meaning | Allowed moves |
|---|---|---|
| `idle` | nothing has run | START |
| `running` | the model is working | STOP, FINISH, FAIL |
| `stopping` | Stop pressed; ends at the next check, no new tool call starts | STOPPED, FINISH, FAIL |
| `done` | answered, or stopped on request | START, RESET |
| `error` | ended with a problem, or was cut off by leaving the page | START, RESET |

A Plan with AI run read back after a page load that still says `running` or `stopping` is shown as `error` with an "interrupted" note and the list of sections it had added.

## 5. Smaller states

| Thing | Where | State |
|---|---|---|
| Plan drawer | `#gccx-plan-toggle[data-gccx-state]` | `open` / `closed` (remembered in `localStorage` `gccx-plan-closed`: `1` closed, `0` open; an older `sessionStorage` value is still read) |
| Feedback panel, loading bar | `src/feedback.js`, `src/loading.js` | not yet marked with `data-gccx-state` |
| GPA reveal, first run | `src/content.js`, `src/onboarding.js`, `src/whatsnew.js` | unchanged; not yet converted |

## Handoff keys

Written with `GCCX.handoff.put(area, key, value, ttlMs)` as `{ v, exp }` and read once with `take`, which deletes the entry.

| Key | Area | Expiry | From → to |
|---|---|---|---|
| `chapelPending` | `chrome.storage.local` | 60 s | `content.js` → `chapel.js` in the chapel frame. The old `{ user, ts }` shape is still read. |
| `gccx-prefill` | `sessionStorage` | 60 s | `degree.js` roadmap → Add/Drop search |
| `gccx-ai-run` | `sessionStorage` | 10 min | `builder.js` before a reload → after it |
| `devReloadTabs` | `chrome.storage.local` | 30 s | `devreload.js` before an extension reload → after it |

Old values without `exp` count as expired.

Not handoffs, left as they are:

| Key | Area | Notes |
|---|---|---|
| `gccx-nav` | `sessionStorage` | `loading.js`, runs before `lib.js`; checks its own 15-second age |
| `gccx-last-term` | `sessionStorage` | last searched term, read many times, no expiry |
| `gccx-guest` | `sessionStorage` | "Continue without signing in", lasts for the tab session |

## Data cleared at sign-out

When `signedout.js` sees myGCC's signed-out page it removes `schedule`, `degree`, `standing`, `balance`, `chapel`, `registration`, `nav`, `pageIndex`, `job`, `degreeMap`, `registered`, `homeFeed` and `forums`, and logs the list. It keeps `settings`, `ai`, `onboarding`, `whatsnewSeen`, `menu:*`, and `plans`, `planTerm`, `termOptions`.

## Known limitations

- **Who is signed in is decided by display name.** The cache, plans and jobs are filed under the name in `#welcomeBackBar`. No unique user ID has been confirmed in real JICS markup, so none is used. Two people with exactly the same name on one computer share saved plans. Needs a look at the real portal for a stable ID.
- **Private pages are recognized by address.** Ask AI skips `/ICS/Financial`, CashNet, and the Degree Progress, grade and transcript portlets. A page that shows grades at another address is not recognized.
