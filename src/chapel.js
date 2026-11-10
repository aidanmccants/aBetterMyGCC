// Runs inside the chapel attendance frame (custom.gcc.edu), which myGCC embeds
// on the My Info > Chapel Attendance page and which aBetterMyGCC loads in a hidden
// frame on the homepage. Reads the attendance table and caches it.
(function () {
  'use strict';
  if (!window.GCCX || !window.GCCX.handoff) return; // lib.js is loaded first in this frame (manifest)
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
  // The myGCC page records whose session started the load (GCCX.handoff, 60 seconds); the frame
  // itself has no name on it. Opened directly, or too late, there is no one to file it under.
  window.GCCX.handoff.take('local', 'chapelPending').then((pending) => {
    const user = pending && pending.user;
    if (!user) return;
    chrome.storage.local.set({ chapel: { ts: Date.now(), user, data } });
  });
})();
