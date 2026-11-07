// aBetterMyGCC Academics (v1.2): one status panel on top of the Academics home,
// headings for the two portlet columns, and a readable degree checklist.
// Only reads text and adds classes/elements; every server link and postback stays in place.
(function () {
  'use strict';
  if (!/^\/ICS\/Academics\/?(Home\.jnz)?$/i.test(location.pathname)) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ASP.NET postback links are `javascript:__doPostBack('target','arg')`. Chrome won't run a
  // javascript: URL clicked from an extension, so do what __doPostBack does: fill the form's
  // two hidden fields and submit it.
  function postBack(a) {
    const m = (a.getAttribute('href') || '').match(/__doPostBack\('([^']*)','([^']*)'\)/);
    const form = a.closest('form') || document.forms[0];
    if (!m || !form) { a.click(); return; }
    const field = (name) => form.querySelector(`input[name="${name}"]`) ||
      form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name }));
    field('__EVENTTARGET').value = m[1];
    field('__EVENTARGUMENT').value = m[2];
    form.submit();
  }

  /* ---------- read what the portal already shows ---------- */
  function readTerm() {
    const info = $('[id$="divTermInfo"]');
    if (!info) return null;
    const t = txt(info);
    const term = (t.match(/Current Term\s*:\s*(.+?)(?:Add Period|Drop Period|$)/i) || [])[1];
    const add = (t.match(/Add Period\s+(\w+)/i) || [])[1] || '';
    const drop = (t.match(/Drop Period\s+(\w+)/i) || [])[1] || '';
    return { term: (term || '').trim(), add, drop };
  }

  function readDegree() {
    const p = $('#pg6_DegreeAuditPortlet');
    if (!p) return null;
    const rows = $$('tbody tr', p).filter((r) => r.cells.length >= 2 && r.cells[0].tagName === 'TD');
    const items = rows.map((r) => {
      const met = /^met$/i.test(txt(r.cells[r.cells.length - 1]));
      r.classList.add('gccx-req', met ? 'is-met' : 'is-not-met');
      const name = txt(r.cells[0]).replace(/\s*,\s*/g, ', ')
        .replace(/^Total Credits Needed\s*=\s*(\d+)$/i, '$1 total credits');
      // same wording in the table as in the overview
      if (name !== txt(r.cells[0]) && !r.cells[0].children.length) setText(r.cells[0], name);
      return { name, met };
    });
    if (!items.length) return null;
    p.classList.add('gccx-acad-degree');
    // Above the table the card repeats the student's name and "Requirements Summary": hide those text lines.
    const table = $('table', p), body = $('.portlet-padding', p);
    if (table && body) {
      $$('*', body).forEach((n) => {
        if (n.children.length || n.closest('table, a, button, input, select') || !txt(n)) return;
        if (n.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) n.classList.add('gccx-acad-hidden');
      });
    }
    return { items, btn: $('[id$="btnViewDetails"]', p) };
  }

  function readInfo() {
    const p = $('#pg5_AcademicInformationPortlet');
    if (!p) return null;
    const advisors = $$('[id*="lblAdvisorInfo"]', p).map(txt).filter(Boolean);
    // Every other label/value row: majors, minors, concentrations, certificates...
    // Values may be one span or several nested .row lines.
    const fields = [];
    $$('.row', p).forEach((r) => {
      const [l, v] = r.children;
      if (!l || !v || !/col-xs-2/.test(l.className)) return;
      const raw = txt(l).replace(/:\s*$/, '');
      if (!raw || /advisor/i.test(raw)) return;
      const lines = $$(':scope > .row', v).map(txt);
      const values = (lines.length ? lines : [txt(v)]).map((s) => s.replace(/^-\s*/, '')).filter(Boolean);
      if (!values.length) return;
      // "Intended Minors" -> "Minor" / "Minors" by how many there are
      const base = raw.replace(/^Intended\s+/i, '').replace(/s$/i, '');
      fields.push({ label: values.length > 1 ? base + 's' : base, values });
    });
    if (!advisors.length && !fields.length) return null;
    // "Dr. Name", "- ECON Staff", "- Business School" -> main advisor + the rest
    const main = advisors.find((a) => !a.startsWith('-')) || advisors[0] || '';
    const extra = advisors.filter((a) => a !== main).map((a) => a.replace(/^-\s*/, ''));
    return { main, extra, fields, portlet: p };
  }

  /* ---------- build ---------- */
  // One status panel, not a row of cards: the term and what you can do in it,
  // the two registration actions, then a short fact list (degree, advisor, major).
  function fact(label) {
    const row = el('div', 'gccx-acad-fact');
    const dd = el('dd');
    row.append(el('dt', null, label), dd);
    return { row, dd };
  }

  function registrationState(add, drop) {
    const a = /open/i.test(add), d = /open/i.test(drop);
    if (a && d) return ['Add and drop are open', true];
    if (a) return ['Adding is open, dropping is closed', true];
    if (d) return ['Dropping is open, adding is closed', true];
    return ['Registration is closed', false];
  }

  /* ---------- safety: step aside instead of breaking the page ---------- */
  // Tell the developer (extension log page) when the portal no longer matches what we expect.
  function warn(message, data) {
    try { if (window.GCCX && GCCX.log) GCCX.log('warn', 'content', `[academics] ${message}`, data); } catch (e) { /* log unavailable */ }
    console.warn('[aBetterMyGCC] academics:', message);
  }

  // Strip every class this file adds inside `scope`, restoring the portal's own look there.
  const OUR_CLASSES = ['gccx-acad-hidden', 'gccx-acad-folded', 'gccx-acad-collapsible', 'is-collapsed', 'gccx-acad-degree',
    'gccx-req', 'is-met', 'is-not-met', 'gccx-num', 'gccx-audit-label', 'gccx-audit-head', 'gccx-course-title', 'gccx-course-meta', 'gccx-acad-records', 'gccx-rec-btn', 'is-main', 'gccx-rec-help'];
  function unmark(scope) {
    if (!scope) return;
    [scope, ...$$('*', scope)].forEach((n) => n.classList && n.classList.remove(...OUR_CLASSES));
  }

  // Run one feature; if it throws, undo just that feature and keep the rest of the page.
  // Every change is undoable so switching the extension off restores the portal without a reload.
  let ok = 0;
  const undos = [];
  const texts = [];
  function setText(node, value) {
    const prop = node.nodeType === 3 ? 'nodeValue' : 'textContent';
    texts.push([node, prop, node[prop]]);
    node[prop] = value;
  }
  function safe(name, run, undo) {
    try { run(); ok++; undos.push(undo); } catch (e) {
      warn(`${name} failed; reverted it`, { error: String(e && e.message || e), stack: e && e.stack });
      try { undo(); } catch (e2) { warn(`${name} undo failed`, { error: String(e2) }); }
    }
  }

  function build() {
    // The user switched the extension off: leave the portal exactly as it is.
    const portlets = $('#portlets');
    if (!portlets) { warn('#portlets not found; portal layout may have changed'); return; }
    if ($('#gccx-acad')) return;
    // Postback screens (e.g. Degree Audit Summary) share this URL but show one portlet;
    // only the hub view, with Add/Drop beside the other portlets, gets the redesign.
    const count = $$('#portlets .portlet').length;
    if (count < 4) {
      // Degree Audit Summary (a postback of My Degree Progress): only tidy its tables.
      if ($('[id$="dgRequirementSummary"]')) safe('audit summary', auditSummary, () => {
        document.documentElement.classList.remove('gccx-audit');
        unmark($('#pg6_DegreeAuditPortlet'));
      });
      return;
    }
    if (!$('#pg0_CourseSchedules')) { warn('Add/Drop portlet (#pg0_CourseSchedules) not found; skipping redesign', { portlets: count }); return; }

    document.documentElement.classList.add('gccx-acad');
    safe('overview', () => buildOverview(portlets), () => {
      $('#gccx-acad')?.remove();
      unmark($('#pg5_AcademicInformationPortlet'));
      unmark($('#pg6_DegreeAuditPortlet'));
    });
    safe('column headings', labelColumns, () => $$('.gccx-acad-col').forEach((n) => n.remove()));
    safe('folding', foldLowValue, () => {
      $$('.gccx-acad-toggle').forEach((n) => n.remove());
      ['#pg3_Universal', '#pg4_BlogPortlet', '#pg5_AcademicInformationPortlet', '#pg6_DegreeAuditPortlet'].forEach((s) => $(s)?.classList.remove('gccx-acad-hidden', 'gccx-acad-collapsible', 'is-collapsed'));
    });
    safe('course tables', tidyCourseTables, () => $$('.pt_CourseSchedules, .pt_AllMyCoursesPortlet, .pt_StudentSchedule').forEach(unmark));
    safe('week view', weekViews, () => {
      $$('.gccx-week, .gccx-week-bar').forEach((n) => n.remove());
      $$('#pg1_AllMyCoursesPortlet table').forEach((t) => { t.hidden = false; });
    });
    safe('records merge', mergeRecords, undoMergeRecords);
    // Student Self-Service embeds a fixed-height, non-scrolling registrar page: size it to its content.
    const unfit = [];
    safe('frame sizing', () => {
      $$('#portlets iframe').filter((f) => /^https:\/\/custom\.gcc\.edu\/gcc_misc\//i.test(f.src || ''))
        .forEach((f) => unfit.push(GCCX.fitFrame(f)));
    }, () => unfit.splice(0).forEach((u) => u()));
    if (!ok) document.documentElement.classList.remove('gccx-acad');
  }

  /* Degree Audit Summary: numbers right-aligned, status on one line, labels unbroken. */
  function auditSummary() {
    const t = $('[id$="dgRequirementSummary"]');
    const head = t.rows[0];
    if (!head) { warn('audit summary table has no header row'); return; }
    const names = [...head.cells].map((c) => txt(c).toLowerCase());
    const numeric = names.map((n) => /hours|hrs|points|gpa|year/.test(n));
    const statusIdx = names.findIndex((n) => /status/.test(n));
    [...t.rows].forEach((r, ri) => [...r.cells].forEach((c, i) => {
      if (numeric[i]) c.classList.add('gccx-num');
      if (ri > 0 && i === statusIdx) {
        const met = /^met$/i.test(txt(c));
        r.classList.add('gccx-req', met ? 'is-met' : 'is-not-met');
      }
    }));
    t.closest('.portlet').classList.add('gccx-acad-degree');
    // "Credits Earned:", "Overall GPA:"... label cells in the facts table above
    $$('#pg6_DegreeAuditPortlet :is(td, th, span, label, div)').forEach((c) => {
      if (c.closest('[id$="dgRequirementSummary"]') || c.querySelector('td, div, table')) return;
      const t = txt(c);
      if (/:\s*$/.test(t) && t.length < 30) c.classList.add('gccx-audit-label');
      else if (/^Requirements Summary$/i.test(t)) c.classList.add('gccx-audit-head');
    });
    document.documentElement.classList.add('gccx-audit');
  }

  function buildOverview(portlets) {
    const term = readTerm(), deg = readDegree(), info = readInfo();
    if (!term && !deg && !info) { warn('no term, degree or advisor data found; overview skipped'); return; }

    const wrap = el('section');
    wrap.id = 'gccx-acad';
    wrap.setAttribute('aria-label', 'Academic overview');

    if (term) {
      const head = el('div', 'gccx-acad-head');
      const [state, open] = registrationState(term.add, term.drop);
      const h = el('h2', 'gccx-acad-lead');
      h.append(el('span', 'gccx-acad-term', term.term || 'This term'),
        el('span', 'gccx-acad-state' + (open ? ' is-open' : ''), state));
      const acts = el('div', 'gccx-acad-actions');
      const ad = $('[id$="lnkAddDrop"]'), cs = $('[id$="lnkAdvancedSearch"]');
      if (ad) { const a = el('a', 'gccx-acad-btn is-primary', 'Add or drop courses'); a.href = ad.href; acts.append(a); }
      if (cs) { const a = el('a', 'gccx-acad-btn', 'Search courses'); a.href = cs.href; acts.append(a); }
      head.append(h, acts);
      wrap.append(head);
    }

    const dl = el('dl', 'gccx-acad-facts');
    if (deg) {
      const met = deg.items.filter((i) => i.met).length;
      const todo = deg.items.filter((i) => !i.met);
      const f = fact('Degree');
      f.dd.append(el('span', 'gccx-acad-strong', `${met} of ${deg.items.length} requirements met`));
      if (deg.btn) {
        const b = el('button', 'gccx-acad-link', 'Full degree audit');
        b.type = 'button';
        b.addEventListener('click', () => postBack(deg.btn));
        f.dd.append(b);
      }
      if (todo.length) {
        const ul = el('ul', 'gccx-acad-todo');
        ul.setAttribute('aria-label', 'Not met yet');
        todo.forEach((i) => ul.append(el('li', null, i.name)));
        f.dd.append(ul);
      }
      dl.append(f.row);
    }
    if (info && info.main) {
      const f = fact('Advisor');
      f.dd.append(el('span', 'gccx-acad-strong', info.main));
      if (info.extra.length) f.dd.append(el('span', 'gccx-acad-muted', info.extra.join(', ')));
      dl.append(f.row);
    }
    if (info) {
      info.fields.forEach(({ label, values }) => {
        const f = fact(label);
        f.dd.append(el('span', 'gccx-acad-strong', values.join(', ')));
        dl.append(f.row);
      });
    }
    if (dl.children.length) wrap.append(dl);
    // its facts are summarised above; keep the full card one click away (never remove student info)
    if (info) collapse(info.portlet);

    // Below the page title + toolbar, directly above the portlet grid.
    const grid = $('#portlet-grid', portlets);
    portlets.insertBefore(wrap, grid && grid.parentElement === portlets ? grid : portlets.firstElementChild);
  }

  /* "INTERMEDIATE SPANISH II" -> "Intermediate Spanish II"; keeps numerals and short acronyms. */
  const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  function titleCase(s) {
    return s.toLowerCase().split(/(\s+|[-/&])/).map((w, i) => {
      const up = w.toUpperCase();
      if (/^[IVX]+$/.test(up) && w.length <= 4) return up;
      if (i > 0 && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('').replace(/\s*,\s*/g, ', ');
  }

  /* Course titles arrive in all caps; status/grade columns read as secondary. */
  function tidyCourseTables() {
    $$('.pt_CourseSchedules table, .pt_AllMyCoursesPortlet table, .pt_StudentSchedule table').forEach((t) => {
      // header = the row with the most <th> (skips the one-cell "Your Schedule" banner)
      const headRow = $$('tr', t).filter((r) => r.querySelector('th'))
        .sort((a, b) => b.querySelectorAll('th').length - a.querySelectorAll('th').length)[0];
      const heads = headRow ? [...headRow.cells].map((h) => txt(h).toLowerCase()) : [];
      const col = (re) => heads.findIndex((h) => re.test(h));
      const titleIdx = col(/title|course name/), metaIdx = [col(/status/), col(/grade/)].filter((i) => i >= 0);
      $$('tbody tr', t).forEach((r) => {
        const c = r.cells;
        if (titleIdx >= 0 && c[titleIdx]) {
          c[titleIdx].classList.add('gccx-course-title');
          // rewrite text nodes only, so any link/span inside the cell survives
          const walker = document.createTreeWalker(c[titleIdx], NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const s = n.nodeValue;
            if (/[A-Z]{3}/.test(s) && s === s.toUpperCase()) setText(n, titleCase(s));
          }
        }
        metaIdx.forEach((i) => c[i] && c[i].classList.add('gccx-course-meta'));
      });
      // A status column that says the same thing on every row ("Current") carries nothing.
      const si = col(/status/);
      const body = $$('tbody tr', t).filter((r) => r.cells[si] && r.cells[si].tagName === 'TD');
      if (si >= 0 && body.length > 1 && new Set(body.map((r) => txt(r.cells[si]))).size === 1) {
        [headRow, ...body].forEach((r) => r.cells[si] && r.cells[si].classList.add('gccx-acad-hidden'));
      }
    });
  }

  /* Real headings so the two columns read as groups. */
  function labelColumns() {
    const names = ['This semester', 'Records and progress'];
    $$('#portlets .portlet-column').slice(0, 2).forEach((c, i) => {
      if (!c.querySelector(':scope > .gccx-acad-col')) c.prepend(el('h2', 'gccx-acad-col', names[i]));
    });
  }

  /* Empty portlets go; reference-only or already-summarised ones collapse behind their header. */
  function collapse(p) {
    const head = p && $('.portlet-header-bar', p);
    if (!head || head.querySelector('.gccx-acad-toggle')) return;
    p.classList.add('gccx-acad-collapsible', 'is-collapsed');
    const b = el('button', 'gccx-acad-toggle', 'Show');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
      const open = !p.classList.toggle('is-collapsed');
      b.textContent = open ? 'Hide' : 'Show';
      b.setAttribute('aria-expanded', String(open));
    });
    head.append(b);
  }

  function foldLowValue() {
    const uni = $('#pg3_Universal');
    // Only truly empty: Student Self-Service is an <iframe> (registrar app) with almost no text of its own.
    const body = uni && $('.portlet-padding, .pSection', uni);
    if (uni && txt(body || uni).length < 40 && !uni.querySelector('iframe, object, embed, form, input, img, a[href]:not([href^="#"]):not(.help)')) {
      uni.classList.add('gccx-acad-hidden');
    }
    collapse($('#pg4_BlogPortlet'));
    // the overview already lists what's unmet; the full table is one click away
    if ($('#gccx-acad .gccx-acad-todo, #gccx-acad .gccx-acad-strong')) collapse($('#pg6_DegreeAuditPortlet'));
  }

  /* ---------- Grade Report + Dean's List + Transcript -> one "Grades and records" card ---------- */
  // Moves the other two portlets' bodies (not copies), so their controls, ids and postbacks keep working.
  // Every move and rename is recorded so undoMergeRecords can put the portal back exactly.
  const recMoves = [];
  let recTitle = null;
  const remember = (node) => recMoves.push([node, node.parentNode, node.nextSibling]);
  function undoMergeRecords() {
    recMoves.reverse().forEach(([node, parent, next]) => parent && parent.insertBefore(node, next && next.parentNode === parent ? next : null));
    recMoves.length = 0;
    $$('.gccx-rec-part, .gccx-rec-actions').forEach((n) => { if (!n.querySelector('[id]')) n.remove(); });
    $$('.gccx-rec-part').forEach((n) => n.replaceWith(...[...n.childNodes].filter((c) => !c.classList || !c.classList.contains('gccx-rec-head'))));
    if (recTitle) recTitle[0].textContent = recTitle[1];
    ['#pg8_GradeReportPortlet', '#pg9_PDFReports', '#pg10_UnofficialTranscript'].forEach((s) => unmark($(s)));
  }

  function mergeRecords() {
    const host = $('#pg8_GradeReportPortlet');
    const hostBody = host && $('.portlet-padding', host);
    if (!hostBody || host.classList.contains('gccx-acad-records')) return;
    const parts = [['#pg9_PDFReports', "Dean's List letters"], ['#pg10_UnofficialTranscript', 'Unofficial transcript']]
      .map(([sel, label]) => [$(sel), label])
      .filter(([p]) => p && $('.portlet-padding', p));
    if (!parts.length) return;
    host.classList.add('gccx-acad-records');
    const title = $('.portlet-header-bar h3 a', host) || $('.portlet-header-bar h3', host);
    if (title) { recTitle = [title, title.textContent]; title.textContent = 'Grades and records'; }
    const first = el('section', 'gccx-rec-part');
    first.append(el('h3', 'gccx-rec-head', 'Grade report'));
    remember(hostBody);
    hostBody.before(first);
    first.append(hostBody);
    parts.forEach(([p, label]) => {
      const s = el('section', 'gccx-rec-part');
      const body = $('.portlet-padding', p);
      remember(body);
      s.append(el('h3', 'gccx-rec-head', label), body);
      host.append(s);
      p.classList.add('gccx-acad-hidden');
    });
    // the portal pads the grade report with empty ruled rows
    $$('tr', host).forEach((r) => {
      if (!txt(r) && !r.querySelector('input, select, a, button, img')) r.classList.add('gccx-acad-hidden');
    });
    // Every record link becomes a button; the first in each section is the main one.
    $$('.gccx-rec-part', host).forEach((part) => {
      const links = $$('a[href]', part).filter((a) => txt(a) && !a.closest('.portlet-header-bar'));
      links.forEach((a, i) => {
        a.classList.add('gccx-rec-btn');
        if (i === 0) a.classList.add('is-main');
        setText(a, txt(a).replace(/^View\s+/i, '').replace(/^Deans List/i, "Dean's List"));
      });
      if (links.length) {
        const row = el('div', 'gccx-rec-actions');
        links[0].parentElement.insertBefore(row, links[0]);
        // record each link's spot so the undo (reverse order) puts it back before the bodies move home
        links.forEach((a) => { remember(a); row.append(a); });
      }
      // instructions and "Division: Undergraduate" read as helper text
      $$('td, span, p, div', part).forEach((n) => {
        if (n.children.length || n.closest('.gccx-rec-actions, label, select')) return;
        const t = txt(n);
        if (/^Select a term/i.test(t) || /^Division/i.test(t) || /^Undergraduate$|^Graduate$/i.test(t)) n.classList.add('gccx-rec-help');
      });
    });
  }

  /* ---------- All My Courses as a week ---------- */
  // Schedule cells read like "Mon, Wed, Fri 10-10:50 AM;" — one or more meetings split by ";".
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_RE = { Mon: /^mo/i, Tue: /^tu/i, Wed: /^we/i, Thu: /^th/i, Fri: /^fr/i, Sat: /^sa/i, Sun: /^su/i };

  function parseMeetings(s) {
    const out = [];
    s.split(';').map((x) => x.trim()).filter(Boolean).forEach((part) => {
      const m = part.match(/^(.*?)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!m) return;
      const days = m[1].split(/[,\s]+/).map((d) => DAYS.find((k) => DAY_RE[k].test(d))).filter(Boolean);
      const to24 = (h, mer) => (h % 12) + (/pm/i.test(mer) ? 12 : 0);
      const end = to24(+m[5], m[7]) * 60 + +(m[6] || 0);
      // start shares the end's AM/PM unless that would put it after the end ("11-12:15 PM" starts at 11 AM)
      let start = to24(+m[2], m[4] || m[7]) * 60 + +(m[3] || 0);
      if (!m[4] && start >= end) start -= 12 * 60;
      if (days.length && end > start) out.push({ days, start, end });
    });
    return out;
  }

  const clock = (min) => {
    const h = Math.floor(min / 60), mm = min % 60;
    return `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
  };

  function weekFor(table) {
    const headRow = $$('tr', table).find((r) => r.querySelector('th'));
    if (!headRow) return null;
    const heads = [...headRow.cells].map((h) => txt(h).toLowerCase());
    const ci = heads.findIndex((h) => /code/.test(h)), ni = heads.findIndex((h) => /name|title/.test(h)), si = heads.findIndex((h) => /schedule|meets/.test(h));
    if (ci < 0 || si < 0) return null;

    const courses = $$('tbody tr', table).filter((r) => r.cells[si] && r.cells[si].tagName === 'TD').map((r, i) => {
      const a = r.cells[ci].querySelector('a');
      return {
        code: txt(r.cells[ci]).replace(/\s*\((\w+)\)\s*$/, ' $1'),
        name: ni >= 0 ? txt(r.cells[ni]) : '',
        href: a ? a.href : '',
        meetings: parseMeetings(txt(r.cells[si])),
        hue: i,
      };
    });
    const timed = courses.filter((c) => c.meetings.length);
    if (!timed.length) return null;

    const all = timed.flatMap((c) => c.meetings);
    const first = Math.floor(Math.min(...all.map((m) => m.start)) / 60) * 60;
    const last = Math.ceil(Math.max(...all.map((m) => m.end)) / 60) * 60;
    const days = DAYS.filter((d, i) => i < 5 || all.some((m) => m.days.includes(d)));

    const wrap = el('div', 'gccx-week');
    wrap.style.setProperty('--gccx-week-days', days.length);
    // The range follows the courses (an evening class stretches it to 9p or later);
    // long days get shorter hours so the week stays about one card tall.
    const span = (last - first) / 60;
    wrap.style.setProperty('--gccx-hour', `${span > 10 ? 30 : span > 7 ? 36 : 44}px`);
    wrap.style.setProperty('--gccx-week-hours', (last - first) / 60);
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Weekly schedule');

    const grid = el('div', 'gccx-week-grid');
    grid.append(el('span', 'gccx-week-corner'));
    days.forEach((d) => grid.append(el('span', 'gccx-week-day', d)));
    const hours = el('div', 'gccx-week-hours');
    for (let t = first; t < last; t += 60) hours.append(el('span', null, clock(t)));
    grid.append(hours);

    days.forEach((d) => {
      const colEl = el('div', 'gccx-week-col');
      timed.forEach((c) => c.meetings.filter((m) => m.days.includes(d)).forEach((m) => {
        const b = el(c.href ? 'a' : 'div', 'gccx-week-blk');
        if (c.href) b.href = c.href;
        b.style.top = `${((m.start - first) / (last - first)) * 100}%`;
        b.style.height = `${((m.end - m.start) / (last - first)) * 100}%`;
        b.dataset.hue = String(c.hue % 6);
        b.title = `${c.code} · ${c.name}\n${d} ${clock(m.start)}–${clock(m.end)}`;
        b.setAttribute('aria-label', `${c.code}, ${c.name}, ${d} ${clock(m.start)} to ${clock(m.end)}`);
        b.append(el('strong', null, c.code.replace(/\s+[A-Z]$/, '')), el('span', null, `${clock(m.start)}–${clock(m.end)}`));
        colEl.append(b);
      }));
      grid.append(colEl);
    });
    wrap.append(grid);

    const loose = courses.filter((c) => !c.meetings.length);
    if (loose.length) {
      const p = el('p', 'gccx-week-loose');
      p.append(el('span', null, 'No set meeting time: '));
      loose.forEach((c, i) => {
        const a = el(c.href ? 'a' : 'span', null, c.code);
        if (c.href) a.href = c.href;
        a.title = c.name;
        p.append(a);
        if (i < loose.length - 1) p.append(document.createTextNode(', '));
      });
      wrap.append(p);
    }
    return wrap;
  }

  function weekViews() {
    const p = $('#pg1_AllMyCoursesPortlet');
    if (!p) return;
    let pref = 'week';
    try { pref = localStorage.getItem('gccx-acad-courses-view') || 'week'; } catch (e) { /* storage blocked */ }
    $$('table', p).forEach((table) => {
      if (table.previousElementSibling && table.previousElementSibling.classList.contains('gccx-week-bar')) return;
      const week = weekFor(table);
      if (!week) return;
      const bar = el('div', 'gccx-week-bar');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Course view');
      const mk = (label, v) => {
        const b = el('button', 'gccx-week-tab', label);
        b.type = 'button';
        b.dataset.view = v;
        b.addEventListener('click', () => set(v, true));
        return b;
      };
      const bw = mk('Week', 'week'), bl = mk('List', 'list');
      bar.append(bw, bl);
      const set = (v, save) => {
        week.hidden = v !== 'week';
        table.hidden = v === 'week';
        bw.setAttribute('aria-pressed', String(v === 'week'));
        bl.setAttribute('aria-pressed', String(v !== 'week'));
        if (save) { try { localStorage.setItem('gccx-acad-courses-view', v); } catch (e) { /* storage blocked */ } }
      };
      table.before(bar, week);
      set(pref, false);
    });
  }

  // Extension switched off: undo every feature in reverse and drop our page classes.
  function teardown() {
    undos.splice(0).reverse().forEach((u) => { try { u(); } catch (e) { warn('teardown step failed', { error: String(e) }); } });
    texts.splice(0).reverse().forEach(([node, prop, value]) => { node[prop] = value; });
    ok = 0;
    document.documentElement.classList.remove('gccx-acad', 'gccx-audit');
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
