// Campus feed: announcements, public events and forum posts read from the student's own myGCC
// pages (same origin, their own sign-in). Parsers are pure (they take a Document); load() caches
// the result in chrome.storage.local. Used by Home and My Info. Nothing here changes a page.
(function (root) {
  'use strict';
  const X = root.GCCX || (root.GCCX = {});

  const TTL = 30 * 60 * 1000;
  const FORUMS_FALLBACK = '/ICS/Campus_Life/Forums.jnz?portlet=Forums';
  const clean = (s) => (X.clean ? X.clean(s) : String(s || '').replace(/\s+/g, ' ').trim());
  // myGCC double-encodes some titles ("Men&amp;#39;s" arrives as the text "Men&#39;s"): decode one
  // extra layer as plain text. The result is only ever rendered escaped.
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decode = (s) => String(s || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()];
    const n = /x/i.test(e[1]) ? parseInt(e.slice(2), 16) : +e.slice(1);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });
  const text = (el) => (el ? clean(decode(el.textContent)) : '');
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const baseOf = (doc) => { try { return doc.baseURI || (typeof location !== 'undefined' ? location.href : undefined); } catch (e) { return undefined; } };
  function link(a, doc) {
    const raw = a && a.getAttribute && a.getAttribute('href');
    if (!raw || !X.safeUrl) return null;
    return X.safeUrl(raw, 'nav', baseOf(doc));
  }

  function findPortlet(doc, re) {
    return [...doc.querySelectorAll('.portlet')].find((p) => re.test((p.className || '') + ' ' + text(p.querySelector('.portlet-header-bar h3')))) || null;
  }

  function cut(s, n) {
    s = clean(s);
    if (s.length <= n) return s;
    const part = s.slice(0, n - 1);
    return part.replace(/\s+\S*$/, '') + '…';
  }

  // ---------- announcements ----------
  function parseAnnouncements(doc) {
    const out = [];
    try {
      const p = findPortlet(doc, /announcement/i);
      if (!p) return out;
      const posts = [...p.querySelectorAll('.post-item')];
      if (posts.length) {
        posts.forEach((it) => {
          const a = it.querySelector('h4 a');
          const title = text(a) || text(it.querySelector('h4'));
          if (!title) return;
          out.push({ title, href: link(a, doc), date: text(it.querySelector('.post-info')), excerpt: cut(text(it.querySelector('.post-content')), 180) });
        });
      } else {
        [...p.querySelectorAll('li')].forEach((li) => {
          const strong = li.querySelector('b, strong');
          const a = li.querySelector('a');
          const all = text(li);
          let title = text(strong);
          if (!title) { const m = /^(.+?[.!?])(\s|$)/.exec(all); title = m ? m[1] : all; }
          if (!title) return;
          const rest = all.startsWith(title) ? all.slice(title.length) : all;
          out.push({ title: cut(title, 140), href: link(a, doc), date: '', excerpt: cut(rest, 180) });
        });
      }
    } catch (e) { X.log && X.log('warn', 'feed', 'parseAnnouncements failed: ' + (e.message || e)); }
    return out.slice(0, 10);
  }

  // ---------- events ----------
  function parseDateText(str, now) {
    const s = clean(str);
    if (!s) return null;
    const day = (y, m, d) => { const dt = new Date(y, m, d); return dt.getMonth() === m ? dt : null; };
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (/\btoday\b/i.test(s)) return base;
    if (/\btomorrow\b/i.test(s)) return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    let m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s);
    if (m) {
      let y = m[3] ? +m[3] : base.getFullYear();
      if (y < 100) y += 2000;
      return day(y, +m[1] - 1, +m[2]);
    }
    m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(s);
    if (m) {
      const mi = MONTHS.indexOf(m[1].toLowerCase());
      let y = m[3] ? +m[3] : base.getFullYear();
      let d = day(y, mi, +m[2]);
      // a bare "January 5" read in late December means next year
      if (d && !m[3] && base - d > 180 * 864e5) d = day(y + 1, mi, +m[2]);
      return d;
    }
    return null;
  }

  function parseClock(str) {
    const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(str);
    if (!m) return null;
    let h = +m[1] % 12;
    if (/p/i.test(m[3])) h += 12;
    return h * 60 + (m[2] ? +m[2] : 0);
  }
  function parseTimeText(str) {
    const s = clean(str);
    if (!s || /all\s*day/i.test(s)) return { start: null, end: null, allDay: true };
    const r = X.parseRange ? X.parseRange(s) : null;
    if (r && r.start != null) return { start: r.start, end: r.end, allDay: false };
    const parts = s.split(/\s*(?:-|–|—|\bto\b)\s*/i);
    const start = parseClock(parts[0]);
    if (start == null) return { start: null, end: null, allDay: true };
    let end = parts[1] ? parseClock(parts[1]) : null;
    if (end != null && end <= start) end = null;
    return { start, end, allDay: false };
  }

  // The portal lists class meetings as "Class Session (COURSE TITLE (SPAN 201 A ...))": show
  // "Course Title" with the course code beside the place.
  function tidyClass(title, location) {
    let kind = 'event';
    // The portal's calendar also lists class meetings as "Class Session (COURSE TITLE (SPAN 201 A ...))"
    const cs = /^class session\s*\((.*?)\)?\s*$/i.exec(title);
    if (cs) {
      kind = 'class';
      const m = /^(.*?)\s*\(\s*([A-Za-z]{2,5}\s*\d{2,4}[A-Za-z]?(?:[\s-]+[A-Za-z0-9]{1,3})?)\b[^)]*\)?\s*$/.exec(cs[1]);
      const name = (m ? m[1] : cs[1]).replace(/\)+$/, '').trim();
      title = X.titleCase ? X.titleCase(name) : name;
      if (m) location = [m[2].toUpperCase(), location].filter(Boolean).join(', ');
    }
    return { title, location, kind };
  }

  function parseEvents(doc, now) {
    const at = now instanceof Date && !isNaN(now) ? now : new Date();
    const out = [];
    const push = (d, timeStr, titleEl, locStr) => {
      let title = text(titleEl);
      if (!d || !title) return;
      const t = parseTimeText(timeStr);
      const c = tidyClass(title, clean(decode(locStr)));
      title = c.title;
      const location = c.location, kind = c.kind;
      out.push({ date: ymd(d), start: t.start, end: t.end, allDay: t.allDay, title, href: titleEl.tagName === 'A' ? link(titleEl, doc) : link(titleEl.querySelector('a'), doc), location, kind });
    };
    try {
      const p = findPortlet(doc, /event|calendar/i);
      if (!p) return out;
      const list = p.querySelector('.calendar-list-view');
      if (list && list.tagName !== 'TABLE') {
        let cur = null;
        [...list.children].forEach((el) => {
          if (el.classList.contains('date')) { cur = parseDateText(text(el), at); return; }
          const spans = [...el.children].filter((c) => c.tagName === 'SPAN');
          const a = (spans[1] && spans[1].querySelector('a')) || el.querySelector('a');
          const titleEl = a || spans[1];
          if (!titleEl) return;
          push(cur, text(spans[0]), titleEl, text(el.querySelector('.location')));
        });
      } else {
        let cur = null;
        [...p.querySelectorAll('tr')].forEach((tr) => {
          const dc = tr.querySelector('td.event-date');
          if (dc) cur = parseDateText(text(dc), at);
          const cells = [...tr.querySelectorAll('td')].filter((c) => c !== dc);
          const cell = cells.find((c) => c.querySelector('a')) || cells[0];
          if (!cell) return;
          const a = cell.querySelector('a');
          push(cur, text(cell.querySelector('.event-time')), a || cell, text(cell.querySelector('.event-location')));
        });
      }
    } catch (e) { X.log && X.log('warn', 'feed', 'parseEvents failed: ' + (e.message || e)); }
    return out.slice(0, 60);
  }

  // ---------- forums ----------
  function parseForums(doc) {
    const out = [];
    try {
      [...doc.querySelectorAll('.forum-grid [role=row]')].forEach((row) => {
        if (row.classList.contains('header-row')) return;
        const fa = row.querySelector('.topic-link-container a');
        if (!fa) return;
        const cell = [...row.querySelectorAll('.forum-grid-column')].find((c) => /latest/i.test(text(c.querySelector('.forum-grid-header-label'))));
        const pa = cell && cell.querySelector('.post-link a');
        if (!pa || !text(pa)) return;
        const attr = cell.querySelector('.post-attribution');
        // <br> adds no space to textContent, so join the child nodes with one
        const line = attr ? clean([...attr.childNodes].map((n) => n.textContent).join(' ')) : '';
        const m = /^by\s+(.+?)\s+on\s+(.+)$/i.exec(line);
        out.push({ forum: text(fa), forumHref: link(fa, doc), title: text(pa), href: link(pa, doc), by: m ? m[1] : line.replace(/^by\s+/i, ''), when: m ? m[2] : '' });
      });
    } catch (e) { X.log && X.log('warn', 'feed', 'parseForums failed: ' + (e.message || e)); }
    return out.slice(0, 8);
  }

  // The nav list lives in chrome.storage (async), so this stays synchronous: page links, then the fallback.
  function forumsUrl(doc) {
    try {
      const here = typeof location !== 'undefined' ? location.origin : '';
      for (const a of doc.querySelectorAll('a[href]')) {
        const raw = a.getAttribute('href');
        if (!/forums?\.jnz|portlet=forums/i.test(raw)) continue;
        let u;
        try { u = new URL(raw, baseOf(doc)); } catch (e) { continue; }
        if (u.origin === here) return u.pathname + u.search;
      }
    } catch (e) { /* fall through */ }
    return FORUMS_FALLBACK;
  }

  // ---------- the portal calendar's own events API ----------
  // The Public Events Calendar portlet loads its events from /ICS/api/calendarevents/ with its portlet id
  // and a date range (live, 2026-11-09). The ids sit in an inline script: viewData.portletId = '<guid>'.
  // One call returns every calendar the student sees: class sessions, Athletics, Christian Formation...
  const GUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  function calendarIds(doc) {
    try {
      const p = findPortlet(doc, /event|calendar/i);
      const scripts = [...((p && p.querySelectorAll('script')) || []), ...doc.querySelectorAll('script')];
      for (const s of scripts) {
        const t = s.textContent || '';
        const a = new RegExp("viewData\\.portletId\\s*=\\s*['\"]" + GUID, 'i').exec(t);
        if (!a) continue;
        const b = new RegExp("viewData\\.settingsPortletId\\s*=\\s*['\"]" + GUID, 'i').exec(t);
        return { portletId: a[1], settingsPortletId: b ? b[1] : a[1] };
      }
    } catch (e) { /* none */ }
    return null;
  }
  const mdy = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  // "2026-11-09T19:00:00" is myGCC's local (campus) time
  function apiTime(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || ''));
    return m ? { d: new Date(+m[1], +m[2] - 1, +m[3]), min: m[4] == null ? null : +m[4] * 60 + +m[5] } : null;
  }
  function mapApiEvent(x) {
    const s = apiTime(x.start), e = apiTime(x.end);
    if (!s || !x.title) return null;
    const allDay = !!x.allDay || s.min == null;
    const cls = x.eventSource === 'lms' || x.eventType === 'sched';
    let title = clean(decode(x.title));
    const cancelled = /^cancell?ed\b[\s:-]*/i.test(title); // "CANCELLED Grove City College ..."
    title = title.replace(/^cancell?ed\b[\s:-]*/i, '');
    const cal = clean(decode(x.calendarName || ''));
    title = title.replace(/^(?:\s*\[[^\]]{1,8}\]\s*)+/, '') || title; // "[L] Grove City College Men's Basketball ..."
    if (/athletic/i.test(cal)) title = title.replace(/^Grove City College\s+/i, ''); // "Men's Basketball at Pitt-Greensburg"
    const c = tidyClass(title, clean(decode(x.location || '')));
    const sameDay = e && ymd(e.d) === ymd(s.d);
    return {
      date: ymd(s.d), start: allDay ? null : s.min, end: allDay || !sameDay ? null : e.min, allDay,
      title: c.title, href: null, location: [cls ? '' : cal, c.location].filter(Boolean).join(', '),
      place: (/^various locations?$/i.test(c.location) ? '' : c.location) || (cls ? '' : cal), // the block's short place line
      kind: cls || c.kind === 'class' ? 'class' : 'event', calendar: cls ? 'Classes' : cal || 'Campus', cancelled,
    };
  }
  // Events from `from` (inclusive) to `to` (exclusive), or null when the page has no calendar ids or the call fails.
  async function calendarEvents(doc, from, to) {
    try {
      const ids = calendarIds(doc || document);
      if (!ids) return null;
      const q = new URLSearchParams({ portletId: ids.portletId, settingsPortletId: ids.settingsPortletId, fullCalendar: 'true', start: mdy(from), end: mdy(to) });
      const safe = X.safeUrl('/ICS/api/calendarevents/?' + q, 'crawl');
      if (!safe) return null;
      const res = await fetch(safe, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) { X.log && X.log('warn', 'feed', `calendar events answered ${res.status}`); return null; }
      const arr = await res.json();
      return (Array.isArray(arr) ? arr : []).map(mapApiEvent).filter(Boolean).slice(0, 300);
    } catch (e) {
      X.log && X.log('warn', 'feed', `calendar events failed: ${e.message || e}`);
      return null;
    }
  }

  // ---------- loading ----------
  const isHome = () => {
    try {
      const u = X.loc();
      return /^\/ics(\/(portal_homepage\.jnz|default\.aspx))?\/?$/i.test(u.pathname) && !u.searchParams.has('portlet') && !u.searchParams.has('tool');
    } catch (e) { return false; }
  };
  let warnedForums = false;

  async function fetchDoc(url, what) {
    const safe = X.safeUrl(url, 'crawl');
    if (!safe) throw new Error('blocked url');
    const res = await fetch(safe, { credentials: 'include' });
    if (!res.ok) {
      if (what === 'forums' && !warnedForums) { warnedForums = true; X.log && X.log('warn', 'feed', `Forums page not found (${res.status}); the address is unverified`, { url: safe }); }
      throw new Error('HTTP ' + res.status);
    }
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  async function fresh(key) {
    if (key === 'homeFeed') {
      const doc = isHome() ? document : await fetchDoc('/ICS/', 'home');
      const now = new Date();
      return { announcements: parseAnnouncements(doc), events: parseEvents(doc, now) };
    }
    return parseForums(await fetchDoc(forumsUrl(document), 'forums'));
  }

  const getSaved = (key) => new Promise((resolve) => {
    try { chrome.storage.local.get(key, (r) => { void chrome.runtime.lastError; resolve(r && r[key] ? r[key] : null); }); } catch (e) { resolve(null); }
  });
  const setSaved = (key, val) => new Promise((resolve) => {
    try { chrome.storage.local.set({ [key]: val }, () => { void chrome.runtime.lastError; resolve(); }); } catch (e) { resolve(); }
  });

  async function load(key, force) {
    try {
      if (key !== 'homeFeed' && key !== 'forums') return { data: null, info: { failed: true } };
      const user = X.parseUser && X.parseUser(document);
      const name = user && user.name;
      if (!name) return { data: null, info: { failed: true } };
      const saved = await getSaved(key);
      const mine = saved && saved.user === name && saved.data != null ? saved : null;
      if (!force && mine && Date.now() - mine.ts < TTL) return { data: mine.data, info: {} };
      try {
        const data = await fresh(key);
        await setSaved(key, { ts: Date.now(), user: name, data });
        return { data, info: {} };
      } catch (e) {
        X.log && X.log('warn', 'feed', `${key} refresh failed: ${e.message || e}`);
        return mine ? { data: mine.data, info: { stale: true, ts: mine.ts } } : { data: null, info: { failed: true } };
      }
    } catch (e) {
      return { data: null, info: { failed: true } };
    }
  }

  X.feed = { parseAnnouncements, parseEvents, parseForums, calendarIds, mapApiEvent, calendarEvents, forumsUrl, load };
})(typeof window !== 'undefined' ? window : globalThis);
