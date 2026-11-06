// Runs inside the chapel attendance frame (custom.gcc.edu), which myGCC embeds
// on the My Info > Chapel Attendance page and which aBetterMyGCC loads in a hidden
// frame on the homepage. Reads the attendance table and caches it.
(function () {
  'use strict';
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // The page wraps everything in layout tables; take the innermost match.
  const table = [...document.querySelectorAll('table')]
    .filter((t) => /required/i.test(t.textContent) && /remaining/i.test(t.textContent))
    .find((t) => !t.querySelector('table'));
  if (!table) return;
  const head = [...table.rows[0].cells].map((c) => clean(c.textContent).toLowerCase());
  const row = table.rows[table.rows.length - 1];
  const num = (name) => {
    const i = head.indexOf(name);
    const v = i >= 0 ? parseFloat(clean(row.cells[i]?.textContent)) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  const data = {
    term: clean(row.cells[head.indexOf('term')]?.textContent),
    required: num('required'),
    rollover: num('rollover'),
    attended: num('attended'),
    special: num('special'),
    remaining: num('remaining'),
  };
  if (data.required == null) return;
  chrome.storage.local.get('chapelPending', ({ chapelPending }) => {
    // The homepage records whose session started the load; the frame itself
    // has no name on it. Fall back to "unknown" if opened directly.
    const user = chapelPending && Date.now() - chapelPending.ts < 60000 ? chapelPending.user : null;
    if (!user) return;
    chrome.storage.local.set({ chapel: { ts: Date.now(), user, data } });
  });
})();
