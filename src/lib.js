// aBetterMyGCC — parsers. Pure functions over Documents/strings so they work for any
// signed-in user; nothing here is specific to one person.
(function (root) {
  'use strict';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

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

  root.GCCX = {
    clean, parseRange, parseDays, fmtTime, parseSchedule, parseDegree, parseChapel,
    parseBalances, parseNav, parseUser, parseCourseLinks, titleCase, prettyRoom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
