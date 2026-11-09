// aBetterMyGCC — parsers. Pure functions over Documents/strings so they work for any
// signed-in user; nothing here is specific to one person.
(function (root) {
  'use strict';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // After the extension reloads or updates, scripts already on the page are orphaned:
  // chrome.runtime/storage throw "Extension context invalidated". Check before calling.
  const alive = () => { try { return !!(root.chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      const m = String((e.reason && e.reason.message) || e.reason || '');
      if (!alive() || /Extension context invalidated/i.test(m)) e.preventDefault();
    });
  }

  // ---------- generic table helpers ----------
  function headerCells(table) {
    const head = table.tHead ? table.tHead.rows[0] : table.querySelector('tr');
    return head ? [...head.cells].map((c) => clean(c.textContent).toLowerCase()) : [];
  }
  function findTable(doc, ...needles) {
    // innermost tables only: JICS pages nest layout tables
    return [...doc.querySelectorAll('table')].filter((t) => !t.querySelector('table')).find((t) => {
      const h = headerCells(t).join('|');
      return needles.every((n) => h.includes(n));
    });
  }
  function bodyRows(table) {
    const rows = table.tBodies.length ? [...table.tBodies].flatMap((b) => [...b.rows]) : [...table.rows].slice(1);
    return rows.filter((r) => !r.querySelector('th') && r.cells.length > 1);
  }
  // cell text keeping <br>/<li> boundaries as newlines
  function cellLines(cell) {
    const c = cell.cloneNode(true);
    c.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    c.querySelectorAll('li').forEach((li) => li.append('\n'));
    return c.textContent.split('\n').map(clean).filter(Boolean);
  }

  // ---------- times ----------
  // "10:00" + "AM" -> minutes since midnight
  function toMin(t, mer) {
    const m = /(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return null;
    let h = +m[1] % 12;
    if (/p/i.test(mer)) h += 12;
    return h * 60 + +m[2];
  }
  // Handles JICS quirks: "10:00 - 10:50 AM", "2:00 PM - 2:50", "11:00 AM - 12:15 PM"
  function parseRange(str) {
    const m = /(\d{1,2}:\d{2})\s*([AP]M)?\s*-\s*(\d{1,2}:\d{2})\s*([AP]M)?/i.exec(str);
    if (!m) return null;
    let [, s, sm, e, em] = m;
    if (!sm && !em) {
      // No AM/PM at all ("11:00 - 12:15"): classes run 7 AM to 10 PM, so
      // 7-11 is morning and 12-6 is afternoon.
      const h = +s.split(':')[0];
      sm = h >= 7 && h <= 11 ? 'AM' : 'PM';
    }
    if (!sm) {
      sm = em;
      if (toMin(s, sm) > toMin(e, em)) sm = 'AM';
    }
    if (!em) {
      em = sm;
      if (toMin(e, em) < toMin(s, sm)) em = 'PM';
    }
    return { start: toMin(s, sm), end: toMin(e, em) };
  }
  const DAY_LETTERS = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
  function parseDays(str) {
    const s = (str || '').toUpperCase().replace(/TH/g, 'R').replace(/SU/g, 'U').replace(/SA/g, 'S');
    if (!/^[MTWRFSU]+$/.test(s)) return null;
    return [...s].map((ch) => DAY_LETTERS[ch]);
  }
  function fmtTime(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function parseDate(s) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
    return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
  }

  // ---------- Student Schedule portlet ----------
  function parseSchedule(doc) {
    const table = findTable(doc, 'course', 'meets');
    if (!table) return null;
    const H = headerCells(table);
    const col = (name) => H.findIndex((h) => h === name || h.startsWith(name));
    const iCode = col('course'), iTitle = col('title'), iCred = col('credits'), iInst = col('course instructors') >= 0 ? col('course instructors') : col('instructor');
    const iMeets = col('meets'), iDates = col('dates'), iRoom = col('room'), iStatus = col('status');
    const termEl = doc.querySelector('select[id*="Term"] option[selected], select option[selected]');
    const caption = [...doc.querySelectorAll('h4, h3, caption, .groupedGrid caption')].map((e) => clean(e.textContent)).find((t) => /semester|term|summer|winter|spring|fall/i.test(t) && t.length < 80);
    const courses = bodyRows(table).map((r) => {
      const cell = (i) => (i >= 0 && r.cells[i] ? r.cells[i] : null);
      const meetLines = cell(iMeets) ? cellLines(cell(iMeets)) : [];
      // one entry per meeting pattern: <li> items if present, else the whole cell
      const roomCell = cell(iRoom);
      const roomLines = !roomCell ? [] : roomCell.querySelector('li') ? [...roomCell.querySelectorAll('li')].map((li) => clean(li.textContent)) : [clean(roomCell.textContent)];
      const meetings = [];
      // Lines alternate "MWF", "10:00 - 10:50 AM" (one pair per meeting pattern)
      for (let k = 0; k < meetLines.length; k++) {
        const days = parseDays(meetLines[k].replace(/\s/g, ''));
        const range = days && meetLines[k + 1] ? parseRange(meetLines[k + 1]) : null;
        if (days && range) {
          meetings.push({ days, ...range, room: prettyRoom(roomLines[meetings.length] || roomLines[0] || '') });
          k++;
        }
      }
      const dates = cell(iDates) ? cellLines(cell(iDates)).join(' ') : '';
      const [d1, d2] = dates.split('-').map(parseDate);
      const link = cell(iCode)?.querySelector('a');
      return {
        code: clean(cell(iCode)?.textContent),
        title: titleCase(clean(cell(iTitle)?.textContent)),
        credits: parseFloat(clean(cell(iCred)?.textContent)) || 0,
        status: clean(cell(iStatus)?.textContent),
        instructor: cell(iInst) ? cellLines(cell(iInst)).join('; ') : '',
        meetings,
        online: !meetings.length,
        room: prettyRoom(roomLines[0] || ''),
        start: d1 ? d1.toISOString() : null,
        end: d2 ? d2.toISOString() : null,
        linkId: link ? link.id : null,
      };
    }).filter((c) => c.code);
    return { term: caption || (termEl ? clean(termEl.textContent) : ''), courses };
  }
  function prettyRoom(s) {
    // "MAIN / STEM / 376" -> "STEM 376"; "MAIN / ONLNE /" -> "Online"
    const parts = s.split('/').map(clean).filter(Boolean);
    if (parts[0] && /^main$/i.test(parts[0])) parts.shift();
    if (/onl/i.test(parts.join(' '))) return 'Online';
    return parts.join(' ');
  }
  const SMALL = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'a', 'an', '&']);
  function titleCase(s) {
    if (!s || s !== s.toUpperCase()) return s;
    return s.toLowerCase().split(' ').map((w, i) => {
      if (/^(i|ii|iii|iv)$/i.test(w)) return w.toUpperCase();
      if (i && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // ---------- Degree Progress portlet ----------
  function parseDegree(doc) {
    const table = findTable(doc, 'name', 'status');
    if (!table) return null;
    const reqs = bodyRows(table).map((r) => {
      const name = clean(r.cells[0].textContent);
      const st = clean(r.cells[1].textContent) || (r.cells[1].querySelector('img') ? r.cells[1].querySelector('img').alt || r.cells[1].querySelector('img').title : '');
      return { name, met: /^met$/i.test(clean(st)) || (/met/i.test(st) && !/not/i.test(st)), status: clean(st) };
    }).filter((r) => r.name);
    return reqs.length ? { reqs } : null;
  }

  // ---------- Chapel (custom.gcc.edu frame) ----------
  function parseChapel(doc) {
    const table = findTable(doc, 'required', 'remaining');
    if (!table) return null;
    const H = headerCells(table);
    const rows = bodyRows(table);
    if (!rows.length) return null;
    const r = rows[rows.length - 1];
    const get = (n) => {
      const i = H.indexOf(n);
      return i >= 0 ? parseFloat(clean(r.cells[i]?.textContent)) : null;
    };
    return {
      term: clean(r.cells[H.indexOf('term')]?.textContent),
      required: get('required'),
      rollover: get('rollover'),
      attended: get('attended'),
      special: get('special'),
      remaining: get('remaining'),
    };
  }

  // ---------- Account balances ----------
  function parseBalances(doc) {
    const text = clean((doc.querySelector('#portlets') || doc.body || doc).textContent);
    const out = [];
    const re = /(Accounts Receivable|Financial Aid|[A-Z][A-Za-z ]{2,40}?)\s+\$([\d,]+\.\d{2})\s+(Credit|Due)/g;
    let m;
    while ((m = re.exec(text))) out.push({ label: clean(m[1]), amount: parseFloat(m[2].replace(/,/g, '')), kind: m[3] });
    return out.length ? out : null;
  }

  // ---------- Navigation index for search ----------
  function parseNav(doc, baseHref) {
    const links = [];
    const add = (a, group) => {
      const href = a.getAttribute('href');
      const label = clean(a.textContent);
      if (!href || !label || href.startsWith('#') || href.startsWith('javascript')) return;
      links.push({ label, href: new URL(href, baseHref).href, group });
    };
    doc.querySelectorAll('#main-nav > li > a').forEach((a) => add(a, 'Tab'));
    doc.querySelectorAll('#this-context-pages a, #contextPages a, #pagePortlets a').forEach((a) => add(a, 'Page'));
    doc.querySelectorAll('#quick-links-menu a').forEach((a) => add(a, /\/ICS\/Academics\/[A-Z]+\/[A-Z]+_\d/.test(a.getAttribute('href') || '') ? 'Course' : 'Quick link'));
    return links;
  }

  // ---------- user / courses from chrome ----------
  function parseUser(doc) {
    const bar = doc.querySelector('#welcomeBackBar');
    if (!bar || !doc.body.classList.contains('logged-in')) return null;
    const txt = clean(bar.textContent);
    const m = /Welcome back\s+(.+?)\s+My profile/i.exec(txt);
    const full = m ? m[1] : '';
    return { name: full, first: full.split(' ')[0] || '' };
  }
  function parseCourseLinks(doc) {
    return [...doc.querySelectorAll('a[href*="/ICS/Academics/"]')]
      .filter((a) => /\/ICS\/Academics\/[A-Z]+\/[A-Z]+_\d+\/[^/]+\/?$/.test(a.getAttribute('href') || ''))
      .map((a) => ({ label: clean(a.textContent), href: a.href }))
      .filter((v, i, arr) => arr.findIndex((x) => x.href === v.href) === i);
  }

  // ---------- live log (nothing is stored; the background only forwards to an open log page) ----------
  function logSafe(d) {
    if (d === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(d, (k, v) => (typeof v === 'string' && v.length > 20000 ? v.slice(0, 20000) + `… [${v.length - 20000} more chars]` : v)));
    } catch (e) { return String(d); }
  }
  // level: info | warn | error | ai ; source: ask | plan | content | background | state | prerender
  function log(level, source, message, data) {
    if (!alive()) return;
    try {
      chrome.runtime.sendMessage({ type: 'log', level, source, message: String(message), data: logSafe(data), ts: Date.now() }, () => { void chrome.runtime.lastError; });
    } catch (e) { /* extension reloading */ }
  }
  // Friendly, specific text for a failed AI call (kind comes from ai.js)
  function aiErrorText(r, what) {
    const raw = (r && r.error) || 'no response';
    switch (r && r.kind) {
      case 'auth': return 'Your AI key was rejected (invalid, expired or out of credit). Check it in the aBetterMyGCC popup.';
      case 'rate': return 'The AI service is rate-limiting this key. Wait a minute and try again.';
      case 'network': return 'Could not reach the AI service. Check your internet connection (or that the browser allowed access to it), then try again.';
      case 'server': return `The AI service had a problem (${raw}). Try again in a moment.`;
      default: return /reload|context invalidated/i.test(raw) ? 'The extension was updated or reloaded. Refresh this page.' : `The AI service rejected the request: ${raw}`;
    }
  }
  // One-line "what the AI is doing now" with a pulsing dot (styles injected once; no css file needed)
  function pulseHTML(text, esc) {
    if (typeof document !== 'undefined' && !document.getElementById('gccx-pulse-css')) {
      const st = document.createElement('style');
      st.id = 'gccx-pulse-css';
      st.textContent = '.gccx-pulse{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:14px;font-style:italic;color:var(--x-muted,#6b625b);min-width:0}'
        + '.gccx-pulse i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--x-accent,#a60000);animation:gccx-pulse 1.1s ease-in-out infinite}'
        + '.gccx-pulse span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
        + '@keyframes gccx-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}'
        + '@media (prefers-reduced-motion:reduce){.gccx-pulse i{animation:none}}';
      (document.head || document.documentElement).appendChild(st);
    }
    return `<div class="gccx-pulse" role="status"><i></i><span>${esc(text)}</span></div>`;
  }
  if (typeof window !== 'undefined' && window.addEventListener && typeof document !== 'undefined') {
    const mine = (f) => !f || /^(chrome|moz)-extension:/.test(f);
    window.addEventListener('error', (e) => { if (e.filename && mine(e.filename)) log('error', 'content', e.message, { file: e.filename, line: e.lineno, stack: e.error && e.error.stack }); });
    window.addEventListener('unhandledrejection', (e) => {
      const st = e.reason && e.reason.stack;
      if (st && /extension:/.test(st)) log('error', 'content', 'Unhandled rejection: ' + (e.reason.message || e.reason), { stack: st });
    });
  }

  // ---------- demo mode ----------
  // The extension's own demo page (demo/index.html) stands in for a myGCC page and
  // sets window.__gccxDemo before this file loads. It is never set on my.gcc.edu
  // (and is ignored outside extension pages), so there loc() is the real location
  // and go() is a plain navigation.
  const demo = typeof window !== 'undefined' && typeof location !== 'undefined' && /-extension:$/.test(location.protocol) && window.__gccxDemo ? window.__gccxDemo : null;
  const loc = () => (demo ? new URL(demo.url, location.origin) : location);
  const go = (href) => { if (demo) demo.go(href); else location.href = href; };

  // Tie a feature to the extension's on/off switch (the `gccx` class content.js toggles live).
  // start() runs whenever the look turns on, stop() whenever it turns off, so switching the
  // extension off removes layout changes too, not just styling, without a page reload.
  function onLook(start, stop) {
    const r = document.documentElement;
    let on = false;
    const sync = () => {
      const now = r.classList.contains('gccx');
      if (now === on) return;
      on = now;
      try { (now ? start : stop)(); } catch (e) { log('error', 'content', `onLook ${now ? 'start' : 'stop'} failed: ${e.message || e}`, { stack: e.stack }); }
    };
    new MutationObserver(sync).observe(r, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // Size a custom.gcc.edu <iframe> to its content. The page inside runs framefit.js, which
  // posts its height; we only accept it from that frame's window and from custom.gcc.edu.
  // Returns an undo function that restores the portal's own size.
  function fitFrame(frame) {
    if (!frame || frame.dataset.gccxFit) return () => {};
    frame.dataset.gccxFit = '1';
    // The portal sets the frame's inline size with its own script, possibly after we run,
    // so remember its height at the moment we first replace it.
    let prevH = null;
    frame.classList.add('gccx-fit-frame');
    const onMsg = (e) => {
      if (e.origin !== 'https://custom.gcc.edu' || e.source !== frame.contentWindow || !e.data || !e.data.gccxFrame) return;
      const h = Number(e.data.height);
      if (!(h > 50 && h < 6000)) return;
      if (prevH === null) prevH = frame.style.getPropertyValue('height');
      frame.style.setProperty('height', `${h}px`, 'important');
    };
    window.addEventListener('message', onMsg);
    // The frame's script may start before or after ours; ask a few times while both settle.
    const ask = () => { try { frame.contentWindow.postMessage({ gccxFrameAsk: 1 }, 'https://custom.gcc.edu'); } catch (e) { /* not loaded yet */ } };
    // Frames on these pages load late (after the dashboard), so keep asking for a while.
    const timers = [0, 400, 1200, 3000, 6000, 10000].map((ms) => setTimeout(ask, ms));
    frame.addEventListener('load', ask);
    window.addEventListener('load', ask, { once: true });
    return () => {
      window.removeEventListener('message', onMsg);
      frame.removeEventListener('load', ask);
      timers.forEach(clearTimeout);
      frame.classList.remove('gccx-fit-frame');
      delete frame.dataset.gccxFit;
      if (prevH !== null) {
        frame.style.removeProperty('height');
        if (prevH) frame.style.setProperty('height', prevH);
      }
    };
  }

  // ---------- state machines ----------
  // A named table of states and the events each one accepts: states = { idle: { START: 'running' }, ... }.
  // send() moves only along the table; anything else is refused with a warning on the Logs page.
  // `el` (an element, or a function returning one) gets data-gccx-state on every move.
  // No DOM or chrome is needed, so Node can test it. Tables live in machines.js; docs/STATE_MACHINES.md.
  function machine(name, { initial, states, el }) {
    let state = initial;
    const mark = () => { const n = typeof el === 'function' ? el() : el; if (n && n.dataset) n.dataset.gccxState = state; };
    const next = (event) => (states[state] || {})[event];
    mark();
    return {
      get state() { return state; },
      can: (event) => !!next(event),
      send(event, data) {
        const to = next(event);
        if (!to) { log('warn', 'state', `${name}: ${event} is not allowed in ${state}`, data); return false; }
        const from = state;
        state = to;
        mark();
        log('info', 'state', `${name}: ${from} → ${to}`, data);
        return true;
      },
    };
  }

  root.GCCX = {
    demo: !!demo, loc, go, alive, fitFrame, onLook,
    log, aiErrorText, pulseHTML, machine,
    clean, parseRange, parseDays, fmtTime, parseSchedule, parseDegree, parseChapel,
    parseBalances, parseNav, parseUser, parseCourseLinks, titleCase, prettyRoom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
