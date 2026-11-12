// aBetterMyGCC Academics (v2): the page kit (GCCX.ui) laid over the Academics home. Hero with the
// term and registration state, stat tiles (degree, advisor, major), what is still to complete, then
// myGCC's own cards MOVED into sections: This semester, Registration, Grades and records, Reference.
// Only reads text, adds classes/elements and moves portal nodes; every link and postback stays live,
// and the extension switching off puts everything back (GCCX.ui.controller).
(function () {
  'use strict';
  if (!/^\/ICS\/Academics\/?(Home\.jnz)?$/i.test(location.pathname)) return;
  const ui = window.GCCX && GCCX.ui;
  if (!ui) return;
  const c = ui.controller('academics');

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

  function readDegree(p) {
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

  function readInfo(p) {
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

  /* ---------- find the portal's cards ---------- */
  // By id first, then by the portlet's pt_ class, because the pgN numbers can shift.
  const PORTLETS = {
    addDrop: ['pg0_CourseSchedules', 'CourseSchedules'], courses: ['pg1_AllMyCoursesPortlet', 'AllMyCoursesPortlet'],
    schedule: ['pg2_StudentSchedule', 'StudentSchedule'], selfService: ['pg3_Universal', 'Universal'],
    blog: ['pg4_BlogPortlet', 'BlogPortlet'], info: ['pg5_AcademicInformationPortlet', 'AcademicInformationPortlet'],
    degree: ['pg6_DegreeAuditPortlet', 'DegreeAuditPortlet'], gpa: ['pg7_GPAProjection', 'GPAProjection'],
    grades: ['pg8_GradeReportPortlet', 'GradeReportPortlet'], dean: ['pg9_PDFReports', 'PDFReports'],
    transcript: ['pg10_UnofficialTranscript', 'UnofficialTranscript'],
  };
  let P = {};
  function findPortlets() {
    P = {};
    for (const [key, [id, cls]] of Object.entries(PORTLETS)) {
      P[key] = document.getElementById(id) || $(`#portlets .portlet.pt_${cls}`);
      if (!P[key]) warn(`portlet ${key} (${id}) not found; skipped`);
    }
  }

  /* ---------- build ---------- */
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
  const OUR_CLASSES = ['gccx-acad-hidden', 'gccx-acad-degree', 'gccx-req', 'is-met', 'is-not-met', 'gccx-num', 'gccx-audit-label',
    'gccx-audit-head', 'gccx-course-title', 'gccx-course-meta', 'gccx-acad-records', 'gccx-rec-btn', 'gccx-rec-help'];
  function unmark(scope) {
    if (!scope) return;
    [scope, ...$$('*', scope)].forEach((n) => n.classList && n.classList.remove(...OUR_CLASSES));
  }

  // Every step is undoable (c.safe) so switching the extension off restores the portal without a reload.
  // Text we rewrite is remembered here and put back by teardown.
  const safe = c.safe;
  const texts = [];
  function setText(node, value) {
    const prop = node.nodeType === 3 ? 'nodeValue' : 'textContent';
    texts.push([node, prop, node[prop]]);
    node[prop] = value;
  }

  // ---- planning term selector (design spec 7.5) ----
  // `gen` changes on every build and teardown so async work can tell it is stale.
  let gen = 0; // bumped on every build and teardown so async work can tell it is stale
  const store = {
    get: (k) => new Promise((r) => { try { chrome.storage.local.get(k, (o) => r(o ? o[k] : undefined)); } catch (e) { r(undefined); } }),
    set: (k, v) => new Promise((r) => { try { chrome.storage.local.set({ [k]: v }, () => r()); } catch (e) { r(); } }),
  };
  const TERM_URL = '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses';
  async function addPlanTerm(acts, g) {
    const user = window.GCCX && GCCX.parseUser && (GCCX.parseUser(document) || {}).name;
    if (!user || !acts || $('#gccx-acad-planterm-select')) return;
    let opts = (((await store.get('termOptions')) || {})[user]) || [];
    if (g !== gen) return;
    if (opts.length < 2) {
      try { // one background read of the Add/Drop page for its Term list; cached for next time
        const res = await fetch(TERM_URL, { credentials: 'same-origin' });
        const html = res.ok ? await res.text() : '';
        if (g !== gen) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const sel = doc.querySelector('select[id$="tabSearch_ddlTermSearch"]');
        opts = sel ? [...sel.options].filter((o) => o.value && !o.disabled).map((o) => ({ value: o.value, label: (o.textContent || '').replace(/\s+/g, ' ').trim() })) : [];
        if (opts.length > 1) {
          const all = (await store.get('termOptions')) || {};
          all[user] = opts;
          await store.set('termOptions', all);
          if (g !== gen) return;
        }
      } catch (e) { opts = []; }
    }
    if (opts.length < 2) { warn('planning term: no term list'); return; }
    if ($('#gccx-acad-planterm-select') || !acts.isConnected) return;
    const stored = ((await store.get('planTerm')) || {})[user];
    if (g !== gen) return;
    const pick = (stored && opts.find((o) => o.value === stored.value)) || (window.GCCX_upcomingTerm && GCCX_upcomingTerm(opts)) || opts[0];
    const label = el('label', 'gccx-acad-planterm');
    const select = el('select');
    select.id = 'gccx-acad-planterm-select';
    opts.forEach((o) => { const op = el('option', null, String(o.label || '').replace(/\s*·.*$/, '').trim()); op.value = o.value; select.append(op); });
    select.value = pick.value;
    select.addEventListener('change', async () => {
      const o = opts.find((x) => x.value === select.value);
      if (!o) return;
      const all = (await store.get('planTerm')) || {};
      all[user] = { value: o.value, label: o.label, ts: Date.now() };
      await store.set('planTerm', all);
    });
    label.append('Planning for ', select);
    acts.append(label);
  }

  function build() {
    gen++;
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
    findPortlets();
    if (!P.addDrop) { warn('Add/Drop portlet (#pg0_CourseSchedules) not found; skipping redesign', { portlets: count }); return; }

    document.documentElement.classList.add('gccx-acad');
    const model = {};
    safe('page', () => buildPage(portlets, model), () => {
      $('#gccx-page')?.remove();
      unmark(P.info);
      unmark(P.degree);
    });
    safe('course tables', tidyCourseTables, () => [P.addDrop, P.courses, P.schedule].forEach(unmark));
    safe('week view', weekViews, () => {
      $$('.gccx-week, .gccx-week-bar').forEach((n) => n.remove());
      if (P.courses) $$('table', P.courses).forEach((t) => { t.hidden = false; });
    });
    safe('records merge', mergeRecords, undoMergeRecords);
    safe('sections', () => layout(model), () => {});
    if (!c.ok) document.documentElement.classList.remove('gccx-acad');
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

  // Hero, stat tiles and "Still to complete": everything we can say from the portal's own cards.
  function buildPage(portlets, model) {
    const term = readTerm(), deg = readDegree(P.degree), info = readInfo(P.info);
    if (!term && !deg && !info) { warn('no term, degree or advisor data found; overview skipped'); return; }
    model.term = term; model.deg = deg; model.info = info;

    const page = ui.page('academics', 'Academics');

    // 1. Hero: the term, the registration state as one sentence, the registration actions.
    const actions = [];
    const ad = $('[id$="lnkAddDrop"]'), cs = $('[id$="lnkAdvancedSearch"]');
    if (ad) actions.push(ui.button('Add or drop courses', { href: ad.href, primary: true }));
    if (cs) actions.push(ui.button('Search courses', { href: cs.href }));
    let lead = null;
    if (term) {
      const [state, open] = registrationState(term.add, term.drop);
      lead = open ? [{ strong: state + '.' }] : [state + '.'];
    }
    const hero = ui.hero({ title: (term && term.term) || 'Academics', lead, actions });
    hero.id = 'gccx-acad'; // the "already built" guard
    hero.setAttribute('aria-label', 'Academic overview');
    page.append(hero);
    if (term) {
      let acts = $('.ux-hero-actions', hero);
      if (!acts) hero.append(acts = ui.el('div', 'ux-hero-actions'));
      const g = gen;
      addPlanTerm(acts, g).catch((e) => warn('planning term failed', { error: String(e && e.message || e) }));
    }

    // 2. Stats: what the student would otherwise click to find. A tile with no data is left out.
    const tiles = [];
    if (deg) {
      const met = deg.items.filter((i) => i.met).length, total = deg.items.length, left = total - met;
      const tile = ui.stat({ label: 'Degree', value: `${met} of ${total}`, small: 'requirements met', meter: (met / total) * 100,
        note: left ? `${left} still to complete` : 'All requirements met', tone: left ? null : 'ok' });
      if (deg.btn) {
        // a button (keyboard reachable) wearing the stat tile; the portal's postback does the navigating
        tile.querySelector('.ux-stat-label').append(ui.el('span', { 'aria-hidden': 'true' }, '›'));
        const b = ui.el('button', { class: tile.className + ' gccx-acad-stat-btn', type: 'button', title: 'Open the full degree audit',
          on: { click: () => postBack(deg.btn) } }, [...tile.childNodes]);
        tiles.push(b);
      } else tiles.push(tile);
    }
    if (info && info.main) tiles.push(ui.stat({ label: 'Advisor', value: info.main, text: true, note: info.extra.join(', ') }));
    if (info) info.fields.forEach(({ label, values }) => tiles.push(ui.stat({ label, value: values.join(', '), text: true })));
    if (tiles.length) page.append(ui.el('div', 'ux-stats', tiles));

    // 3. Still to complete: the unmet requirements, one card.
    const todo = deg ? deg.items.filter((i) => !i.met) : [];
    if (todo.length) {
      const sec = ui.section('Still to complete');
      const card = ui.card(`${todo.length} requirement${todo.length === 1 ? '' : 's'} not met yet`,
        { aside: deg.btn ? ui.button('Full degree audit', { small: true, onClick: () => postBack(deg.btn) }) : null });
      card.body.append(ui.chips(todo.map((i) => i.name)));
      sec.body.append(card.root);
      page.append(sec.root);
    }

    // Directly above the portlet grid.
    const grid = $('#portlet-grid', portlets);
    portlets.insertBefore(page, grid && grid.parentElement === portlets ? grid : portlets.firstElementChild);
  }

  // myGCC's own cards, moved (never copied) into sections under the hero. #portlet-grid stays, emptied.
  function layout(model) {
    const page = $('#gccx-page');
    if (!page) return;
    const box = (kids, single) => {
      const b = ui.el('div', 'ux-portlets');
      kids.filter(Boolean).forEach((p) => c.move(p, b));
      if (single || b.children.length < 2) b.classList.add('is-single');
      return b.children.length ? b : null;
    };
    const add = (title, body, aside) => {
      if (!body) return;
      const sec = ui.section(title, { aside });
      sec.body.append(body);
      page.append(sec.root);
    };
    const { deg, info, term } = model;
    const regTerm = (() => {
      const h = P.schedule && $('table thead th', P.schedule);
      const t = txt(h).replace(/\s+-\s+[A-Z]{1,4}$/, '');
      return /\d{4}|semester|term/i.test(t) ? t : (term && term.term) || '';
    })();

    add('This semester', box([P.courses], true));
    // Student Schedule has the meeting times, so it gets the wider column; Add/Drop (seats, actions) sits beside it.
    const reg = box([P.schedule, P.addDrop]);
    if (reg) reg.classList.add('gccx-acad-reg');
    add('Registration', reg, regTerm);

    // Grades card on the left; the GPA projection and the (folded) degree table beside it.
    const left = ui.col(), right = ui.col();
    if (P.grades) c.move(P.grades, left);
    [P.gpa, P.degree].forEach((p) => p && c.move(p, right));
    const cols = [left, right].filter((x) => x.children.length);
    if (cols.length) {
      const b = ui.el('div', 'ux-portlets' + (cols.length < 2 ? ' is-single' : ''), cols);
      add('Grades and records', b);
    }
    if (deg) c.collapse(P.degree); // the stats and "Still to complete" summarise it

    // Reference: summarised-elsewhere or rarely needed cards, then anything the portal added that we do not know.
    const known = new Set(Object.values(P));
    const ref = [P.info, P.blog, P.selfService];
    if (info) c.collapse(P.info);
    c.collapse(P.blog);
    $$('#portlet-grid .portlet').filter((p) => !known.has(p)).forEach((p) => {
      const kind = ui.triage(p);
      if (kind === 'empty') c.hide(p);
      else { if (kind === 'decor') c.collapse(p); ref.push(p); }
    });
    [P.selfService, P.blog].forEach((p) => { if (p && ui.triage(p) === 'empty') c.hide(p); });
    add('Reference', box(ref, true));
    // the grid's columns are empty now; they stay in place so teardown has somewhere to put things back
    // Student Self-Service embeds a fixed-height, non-scrolling registrar page: size it to its content.
    c.fitFrames(page);
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

  /* ---------- Grade Report + Dean's List + Transcript -> one "Grades and records" card ---------- */
  // Moves the other two portlets' bodies (not copies), so their controls, ids and postbacks keep working.
  // Every move and rename is recorded so undoMergeRecords can put the portal back exactly.
  const recMoves = [];
  let recTitle = null;
  const recBtns = []; // links we dressed as kit buttons
  const remember = (node) => recMoves.push([node, node.parentNode, node.nextSibling]);
  function undoMergeRecords() {
    recMoves.reverse().forEach(([node, parent, next]) => parent && parent.insertBefore(node, next && next.parentNode === parent ? next : null));
    recMoves.length = 0;
    $$('.gccx-rec-part, .gccx-rec-actions').forEach((n) => { if (!n.querySelector('[id]')) n.remove(); });
    $$('.gccx-rec-part').forEach((n) => n.replaceWith(...[...n.childNodes].filter((c) => !c.classList || !c.classList.contains('gccx-rec-head'))));
    if (recTitle) recTitle[0].textContent = recTitle[1];
    recBtns.splice(0).forEach((a) => a.classList.remove('ux-btn'));
    [P.grades, P.dean, P.transcript].forEach(unmark);
  }

  function mergeRecords() {
    const host = P.grades;
    const hostBody = host && $('.portlet-padding', host);
    if (!hostBody || host.classList.contains('gccx-acad-records')) return;
    const parts = [[P.dean, "Dean's List letters"], [P.transcript, 'Unofficial transcript']]
      .map(([p, label]) => [p, label])
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
    // Every record link becomes a kit button.
    $$('.gccx-rec-part', host).forEach((part) => {
      const links = $$('a[href]', part).filter((a) => txt(a) && !a.closest('.portlet-header-bar'));
      links.forEach((a) => {
        a.classList.add('gccx-rec-btn', 'ux-btn');
        recBtns.push(a);
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
    const p = P.courses;
    if (!p) return;
    let pref = 'week';
    try { pref = localStorage.getItem('gccx-acad-courses-view') === 'list' ? 'list' : 'week'; } catch (e) { /* storage blocked */ }
    $$('table', p).forEach((table) => {
      if (table.previousElementSibling && table.previousElementSibling.classList.contains('gccx-week-bar')) return;
      const week = weekFor(table);
      if (!week) return;
      const bar = el('div', 'gccx-week-bar');
      const seg = ui.seg([{ value: 'week', label: 'Week' }, { value: 'list', label: 'List' }], pref, (v) => set(v, true), 'Course view');
      bar.append(seg);
      const set = (v, save) => {
        week.hidden = v !== 'week';
        table.hidden = v === 'week';
        if (save) { try { localStorage.setItem('gccx-acad-courses-view', v); } catch (e) { /* storage blocked */ } }
      };
      table.before(bar, week);
      set(pref, false);
    });
  }

  // Extension switched off: the controller puts every moved, hidden or collapsed card back and runs each
  // step's undo in reverse; then the text we rewrote is restored and our page classes dropped.
  function teardown() {
    gen++;
    c.teardown();
    texts.splice(0).reverse().forEach(([node, prop, value]) => { node[prop] = value; });
    document.documentElement.classList.remove('gccx-acad', 'gccx-audit');
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
