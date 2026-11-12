# Design system: pages

How every redesigned myGCC page is put together. Home, My Info and Academics follow it; a new page starts here.

- Tokens: `src/theme-engine/tokens.css` (colour, radius, spacing `--x-s1..7`, type `--x-fs-*`).
- Parts: `src/ui.css` (classes, all `ux-`) and `src/ui.js` (`GCCX.ui` builders).
- Page files (`home.*`, `myinfo.*`, `academics.*`, the dashboard in `content.js`) decide **what** goes on the page and **where**. They do not restyle parts.

## 1. What each page is for

A page answers one question. Anything that does not help answer it moves down, folds, or belongs on another page.

| Page | Question | Lead | Never here |
|---|---|---|---|
| **Home** | What is the college saying and doing? | Announcements, the campus calendar | Personal numbers (chapel, balance, degree) |
| **My Info** | What do I need to know about my day and my standing? | Next class, dining now, chapel, library hours; degree lower down | Campus news; money (that is CashNet) |
| **Academics** | What am I taking, what can I register for, how far along am I? | Term and registration state, schedule, degree progress | Dining, buildings, forums |

## 2. Page anatomy

Every page is one `section.ux-page#gccx-page` placed above myGCC's `#portlet-grid`, read top to bottom:

1. **Hero** (`ux-hero`): the page title or greeting, then **one sentence that says what matters right now**, then at most three actions (one primary).
2. **Stats** (`ux-stats`, optional): up to four `ux-stat` tiles. A tile is a number the student would otherwise click to find. Each links to its source page. Tiles are for things that change within a day or a week (next class, what is being served, chapel count, is the library open). Term-long numbers (degree progress, credit totals) go in a section lower down, except on Academics, where they are the point of the page.
3. **Sections** (`ux-section`): a titled group holding a `ux-grid` of `ux-card`s. Two to four sections.
4. **myGCC's own cards**: the last section(s). The portal's `.portlet` nodes are *moved* into `ux-portlets` (never copied, so links, forms and postbacks keep working) and sorted by the rules in section 4.

Type has three levels only: hero (`--x-fs-hero`), section title (`--x-fs-section`), card title (`--x-fs-card`). Body is `--x-fs-body`; secondary text is `--x-fs-small` in `--x-muted`.

Layout: `ux-grid is-wide-narrow` (3fr/2fr) for a main column plus a rail, `is-even` for two equals. Grids fall to one column when the page area is under 760px (container query, so the plan drawer and sidebar are accounted for). One gap everywhere: `--x-gap`.

## 3. Relevance rules

1. **Now first.** Order by time: happening now, later today, this week, this term, reference. The hero sentence is computed from data, never a slogan. Examples: "Next: **Intermediate Spanish I** at 9:00 AM tomorrow in HAL 103." / "**Add and drop are open** for Spring Semester 2027."
2. **One fact, one place.** If a stat tile or card states something, the portal card that says the same thing is collapsed (still one click away), not shown twice.
3. **Nothing to do, nothing to show.** A card that has no data and no action is left out. "Registration is closed" is a line in the hero, not a card.
4. **Say which kind of nothing.** Loading, empty, could not load and showing a saved copy look different (`GCCX.ui.state`, and the existing card machines in `machines.js`).
5. **Private stays private.** GPA stays behind press-and-hold (`hideGpa`). Nothing personal on Home.
6. **Numbers carry a meaning.** "11 of 12" comes with "1 more this semester"; a balance comes with "Nothing due" or "Amount due".

## 4. myGCC's own cards

`GCCX.ui.triage(portlet)` sorts each portal card:

| Result | Meaning | Treatment |
|---|---|---|
| `content` | has text, links, a form or a frame | shown; collapsed if rule 2 applies |
| `decor` | only a picture | collapsed |
| `empty` | nothing to read or use | hidden (`c.hide`) |

Student information is never deleted. Hidden and collapsed cards come back the moment the extension is switched off.

## 5. Parts

All built with `GCCX.ui` (DOM nodes, `textContent` only). The dashboard in `content.js` renders HTML strings; it uses the same classes and must pass every value through `esc()`.

| Part | Builder | Use for |
|---|---|---|
| Page frame | `ui.page(name, label)` | one per page |
| Hero | `ui.hero({ eyebrow, title, lead, actions })` | top of page |
| Stat tile | `ui.stat({ label, value, small, note, href, tone, meter })` | a checked-often number |
| Section | `ui.section(title, { aside })` | a titled group |
| Grid / column | `ui.grid(kind, kids)`, `ui.col(kids)` | layout |
| Card | `ui.card(title, { aside, sub, state })` | one topic |
| Row list | `ui.list([ui.row({ lead, title, sub, end, state })])` | classes, events, posts, buildings |
| Badge / chips | `ui.badge(text, tone)`, `ui.chips(items)` | status; short tag lists |
| Button / link | `ui.button(text, { href, primary })`, `ui.link(text, href)` | actions; "see all" |
| Segmented | `ui.seg(options, current, onPick, label)` | switching a view |
| Facts | `ui.facts([[label, value]])` | advisor, major |
| Tiles | `ui.tiles([{ title, desc, href }])` or `{ title, desc, onClick }` | a set of destinations, each with a reason. For a portal postback link use `onClick: () => ui.postBack(link)` |
| Disclosure | `ui.more(summary, kids)` | detail on demand |
| State | `ui.state(kind, text)` | loading / empty / error / stale |

Tones are `ok`, `warn`, `bad`, `info`. Crimson (`--x-accent`) is for the primary action, the current item and links; it is not a status colour.

If a page needs something the kit lacks, add it to `ui.css` / `ui.js` as a general part and list it here. Do not build a one-off in a page file.

## 6. Page scripts

```js
const c = GCCX.ui.controller('home');
function build() {
  c.safe('hero', () => { /* add */ }, () => { /* undo */ });   // a step that throws is undone; the rest still run
  c.move(portlet, section.body);                               // remembered and put back on teardown
  c.collapse(portlet); c.hide(portlet); c.fitFrames();
}
GCCX.onLook(build, () => { c.teardown(); /* remove #gccx-page */ });
```

- Check the portal looks as expected before changing it; if not, log with `c.warn` and leave the page alone.
- Everything inserted has an id starting `gccx-` or sits inside `#gccx-page`, so the off-switch rule in `theme.css` covers it.
- Elements with data from a load carry `data-gccx-state`.

## 7. Kept as is

- **The Home calendar** (`weekcal.js`, `weekcal.css`, the calendar card in `home.js`) keeps its own look: a week board, one column per day, each event a solid colour block (blue campus events, pink classes), with the Campus events / Classes chips and the Week / List switch. Blocks read time, title, venue. Today's first unfinished block is marked Next or Now. In the current week, days already over are narrow columns that open on click. Pages may move the card; changes to the board itself go in `weekcal.*`.
- The plan drawer, Add/Drop builder, degree roadmap, search palette and forums pages are outside this system for now.

## 8. Checking a change

Light and dark, at 1360, 820 and 390 wide. No sideways scroll. Switch the extension off from the popup: the portal must come back whole without a reload. `npm test` passes.
