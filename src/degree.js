// aBetterMyGCC: degree roadmap on myGCC's My Degree Progress page.
// Reads the signed-in person's own requirement pages (same origin, their session)
// and caches the result in chrome.storage.local for 24 hours.
(function () {
  'use strict';

  const PAGE = '/ICS/Academics/Home.jnz?portlet=My_Degree_Progress';
  const ADD_DROP = '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses';
  const CACHE_KEY = 'degreeMap';
  const TTL = 24 * 3600e3;
  const PREFILL_KEY = 'gccx-prefill';
  const ROOT_ID = 'gccx-degree';
  const HIDDEN_ATTR = 'data-gccx-degree-hidden';
  const SUMMARY_SEL = '[id$="dgRequirementSummary"]';
  const CHECK = '✓';

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const num = (s) => { const n = parseFloat(String(s ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  const fmt = (n) => String(Math.round(n * 100) / 100);
  const isMet = (s) => /\bmet\b/i.test(s) && !/not\s*met/i.test(s);
  const isProgress = (s) => /in\s*progress/i.test(s);
  const at = (cells, i) => (i >= 0 && i < cells.length ? cells[i] : '');
  const col = (head, re) => head.findIndex((h) => re.test(h));
  // "HUMA303" or "HUMA 303" -> "HUMA 303"
  function reqCode(s) {
    const m = /^([A-Za-z]{2,5})(\d{2,4}[A-Za-z]?)$/.exec(clean(s).replace(/\s+/g, ''));
    return m ? `${m[1].toUpperCase()} ${m[2]}` : '';
  }

  const store = {
    get: (k) => new Promise((ok) => { try { chrome.storage.local.get(k, (o) => ok(o ? o[k] : undefined)); } catch (e) { ok(undefined); } }),
    set: (k, v) => new Promise((ok) => { try { chrome.storage.local.set({ [k]: v }, () => ok()); } catch (e) { ok(); } }),
  };
  // cache is keyed to the signed-in person so shared computers never mix data
  function userKey() {
    const u = window.GCCX && window.GCCX.parseUser ? window.GCCX.parseUser(document) : null;
    return u ? u.name : null;
  }

  // ---------- myGCC requests ----------
  const REQUEST_MS = 20000; // a myGCC request that never answers must not leave the roadmap loading forever
  async function getDoc(url, init) {
    const limit = AbortSignal.timeout(REQUEST_MS);
    const signal = ctl ? AbortSignal.any([ctl.signal, limit]) : limit;
    const res = await fetch(url, { credentials: 'include', signal, ...init });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }
  // ASP.NET postback target from a link's href (or onclick for buttons)
  function targetOf(el) {
    const src = [el.getAttribute('href'), el.getAttribute('onclick')].find((s) => s && /__doPostBack/.test(s)) || '';
    const m = /__doPostBack\('([^']+)'/.exec(src);
    if (!m) throw new Error('No postback target');
    return m[1];
  }
  // Post the page's own form fields plus __EVENTTARGET, the way the browser would.
  function postback(doc, target) {
    const form = doc.querySelector('form');
    if (!form) throw new Error('No form on myGCC page');
    const body = new URLSearchParams();
    form.querySelectorAll('input[name], select[name]').forEach((i) => {
      if (['submit', 'button', 'image', 'checkbox', 'radio'].includes(i.type)) return;
      body.set(i.name, i.value || '');
    });
    body.set('__EVENTTARGET', target);
    body.set('__EVENTARGUMENT', '');
    return getDoc(PAGE, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }
  async function ensureSummary(doc) {
    if (doc.querySelector(SUMMARY_SEL)) return doc;
    const btn = doc.querySelector('[id$="btnViewDetails"]');
    if (!btn) throw new Error('Degree summary not found');
    return postback(doc, targetOf(btn));
  }

  // ---------- parsing ----------
  function tableOf(el) {
    if (!el) return null;
    return el.tagName === 'TABLE' ? el : el.querySelector('table');
  }
  // The header row is the first row with a cell matching headerRe; data rows follow it.
  function readGrid(table, headerRe) {
    if (!table) return null;
    const rows = [...table.rows];
    const hi = rows.findIndex((r) => [...r.cells].some((c) => headerRe.test(clean(c.textContent))));
    if (hi < 0) return null;
    const head = [...rows[hi].cells].map((c) => clean(c.textContent).toLowerCase());
    const body = rows.slice(hi + 1)
      .filter((r) => r.cells.length > 1)
      .map((r) => ({ tr: r, cells: [...r.cells].map((c) => clean(c.textContent)) }));
    return { head, body };
  }

  function parseSummary(doc) {
    const text = clean([...doc.querySelectorAll('.portlet')].map((p) => p.textContent).join(' ')) || clean(doc.body.textContent);
    const earnedTxt = /Credits Earned:\s*([\d.,]+)/i.exec(text);
    const gpaTxt = /Overall GPA:\s*([\d.]+)/i.exec(text);
    const g = readGrid(tableOf(doc.querySelector(SUMMARY_SEL)), /^requirement$/i);
    if (!g) throw new Error('Requirement summary not found');
    const c = {
      name: col(g.head, /^requirement/),
      needed: col(g.head, /hours needed/),
      earned: col(g.head, /hours earned/),
      progress: col(g.head, /progress/),
      status: col(g.head, /^status/),
    };
    let needed = 0, earned = 0, progress = 0;
    const reqs = [];
    for (const row of g.body) {
      const name = at(row.cells, c.name);
      if (!name) continue;
      if (/^total/i.test(name)) {
        const m = /=\s*([\d.]+)/.exec(name);
        needed = m ? num(m[1]) : num(at(row.cells, c.needed));
        earned = num(at(row.cells, c.earned));
        progress = num(at(row.cells, c.progress));
        continue;
      }
      const status = at(row.cells, c.status);
      const met = isMet(status);
      reqs.push({
        name,
        met,
        status,
        needed: num(at(row.cells, c.needed)),
        earned: num(at(row.cells, c.earned)),
        progress: num(at(row.cells, c.progress)),
        hasDetail: !met && !!row.tr.querySelector('[id$="lnkRequirement"]'),
      });
    }
    if (!earned) earned = num(earnedTxt && earnedTxt[1]);
    if (!progress) progress = reqs.reduce((s, q) => s + q.progress, 0);
    return {
      credits: { needed, earned, progress },
      gpa: gpaTxt ? gpaTxt[1] : '',
      reqs,
    };
  }

  // "15.00 Credits; 5 Requirement(s); GPA (3.39)" -> { credits: 15, requirements: 5, courses: null, gpa: '3.39' }
  function amounts(s) {
    const t = String(s || '');
    const grab = (re) => { const m = re.exec(t); return m ? num(m[1]) : null; };
    const g = /GPA\s*\(?\s*([\d.]+)/i.exec(t);
    return {
      credits: grab(/([\d.]+)\s*(?:credits?|hours?)\b/i),
      requirements: grab(/([\d.]+)\s*requirement/i),
      courses: grab(/([\d.]+)\s*courses?\b/i),
      gpa: g ? g[1] : '',
      plain: /^\s*[\d.]+\s*$/.test(t) ? num(t) : null, // an older layout: a bare number
    };
  }
  function amountText(need, got) {
    const units = [['credits', 'credits'], ['requirements', 'requirements'], ['courses', 'courses']];
    for (const [k, label] of units) {
      const one = (n) => (n === 1 ? label.replace(/s$/, '') : label);
      if (need[k] > 0 && got[k] > need[k]) return `${fmt(got[k])} ${one(got[k])} (${fmt(need[k])} needed)`; // more than needed
      if (need[k] > 0) return `${fmt(got[k] || 0)} of ${fmt(need[k])} ${one(need[k])}`;
    }
    if (need.plain > 0) return `${fmt(got.plain ?? got.credits ?? 0)} of ${fmt(need.plain)}`;
    const bits = [];
    if (got.credits > 0) bits.push(`${fmt(got.credits)} credits earned`);
    else if (got.requirements > 0) bits.push(`${fmt(got.requirements)} done`);
    else if (got.plain > 0) bits.push(`${fmt(got.plain)} earned`);
    if (got.gpa) bits.push(`GPA ${got.gpa}`);
    return bits.join(', ');
  }

  function parseDetail(doc) {
    const catTable = tableOf(doc.querySelector('[id$="dgCategoryRequirements"]'));
    const detailTable = [...doc.querySelectorAll('table')].find((t) => t !== catTable && readGrid(t, /^req$/i));
    const rows = [];
    const g = readGrid(detailTable, /^req$/i);
    if (g) {
      const h = g.head;
      // Two "Earned" columns: hours (before Grade Needed) and grade (after it).
      // Only the grade column is shown, since it is set once a course is earned.
      const gn = col(h, /^grade/);
      const earnedIdx = h.map((x, i) => (/earned/.test(x) ? i : -1)).filter((i) => i >= 0);
      const gradeEarned = earnedIdx.find((i) => gn >= 0 && i > gn) ?? -1;
      const c = {
        req: col(h, /^req$/),
        desc: col(h, /^description/),
        status: col(h, /^status/),
        course: col(h, /^course$/),
        title: col(h, /^course title/),
      };
      for (const { cells } of g.body) {
        const r = {
          req: at(cells, c.req),
          desc: at(cells, c.desc),
          status: at(cells, c.status),
          course: at(cells, c.course),
          title: at(cells, c.title),
          gradeEarned: at(cells, gradeEarned),
        };
        if (r.req || r.course || r.desc) rows.push(r);
      }
    }
    const categories = [];
    const cg = readGrid(catTable, /^requirement$/i);
    if (cg) {
      const cc = { name: col(cg.head, /^requirement/), status: col(cg.head, /^status/), needed: col(cg.head, /needed/), earned: col(cg.head, /earned/) };
      // Live cells are text with units, not numbers (2026-11-09): Needed is often blank or "1 Requirement(s)";
      // Earned is "15.00 Credits; 5 Requirement(s); 50.97 Quality Points; GPA (3.39)". Reading them as plain
      // numbers printed "15 of 0". Read each amount by its unit and compare like with like.
      for (const { cells } of cg.body) {
        const name = at(cells, cc.name);
        if (!name) continue;
        const need = amounts(at(cells, cc.needed)), got = amounts(at(cells, cc.earned));
        categories.push({ name, met: isMet(at(cells, cc.status)), amount: amountText(need, got) });
      }
    }
    return { rows, categories };
  }

  function findRequirementLink(doc, name) {
    return [...doc.querySelectorAll('[id$="lnkRequirement"]')].find((a) => {
      const row = a.closest('tr');
      return clean(a.textContent) === name || (!!row && clean(row.cells[0] && row.cells[0].textContent) === name);
    }) || null;
  }

  // Summary first, then each unmet requirement in turn. Every detail starts from a
  // fresh summary page, because opening one requirement replaces the view.
  // The summary is read from the page already open when it has one (no wait), and
  // onStep(summary, done, total) is called after the summary and after each detail.
  async function loadAll(g, fromPage, onStep) {
    const stop = () => { if (g !== gen) throw new Error('stopped'); };
    let summary = null;
    if (fromPage && document.querySelector(SUMMARY_SEL)) {
      try { summary = parseSummary(document); } catch (e) { summary = null; }
    }
    if (!summary) summary = parseSummary(await ensureSummary(await getDoc(PAGE)));
    stop();
    const total = summary.reqs.filter((q) => q.hasDetail).length;
    let done = 0;
    onStep(summary, done, total);
    for (const q of summary.reqs) {
      if (!q.hasDetail) continue;
      stop();
      try {
        const base = await ensureSummary(await getDoc(PAGE));
        stop();
        const link = findRequirementLink(base, q.name);
        if (link) q.detail = parseDetail(await postback(base, targetOf(link)));
      } catch (e) {
        stop();
        warn(`detail for "${q.name}" failed`, { error: String(e && e.message || e) });
      }
      q.loaded = true;
      onStep(summary, ++done, total);
    }
    stop();
    return summary;
  }

  // ---------- rendering ----------
  function stateOf(q) {
    if (q.earned > 0) return { text: q.needed ? `${fmt(q.earned)} of ${fmt(q.needed)} hours` : `${fmt(q.earned)} hours`, done: false };
    if (q.progress > 0 || isProgress(q.status)) return { text: 'In progress', done: false };
    return { text: 'Not started', done: false };
  }

  function rowHTML(r) {
    const done = isMet(r.status);
    const hasCourse = !!r.course && !/see available/i.test(r.course);
    const code = hasCourse ? r.course : (reqCode(r.req) || clean(r.req));
    const title = hasCourse ? r.title : r.desc;
    const label = done ? 'Met' : isProgress(r.status) ? 'In progress' : /required/i.test(r.status) ? 'Required' : clean(r.status);
    const grade = done && r.gradeEarned ? ` · Grade ${esc(r.gradeEarned)}` : '';
    const code2 = reqCode(r.req);
    const find = !done && code2 && /required|in\s*progress/i.test(r.status)
      ? `<button type="button" class="gx-find" data-gccx-find="${esc(code2)}">Find open sections</button>`
      : '';
    return `<li class="gx-row${done ? ' is-done' : ''}">`
      + `<span class="gx-mark" aria-hidden="true">${done ? CHECK : ''}</span>`
      + `<span class="gx-course">${code ? `<span class="gx-code">${esc(code)}</span>` : ''}${title ? `<span class="gx-title">${esc(title)}</span>` : ''}</span>`
      + `<span class="gx-side"><span class="gx-meta">${esc(label)}${grade}</span>${find}</span>`
      + `</li>`;
  }

  function detailHTML(d) {
    const cats = (d.categories || []).map((c) => `<li class="gx-cat${c.met ? ' is-done' : ''}"><span>${esc(c.name)}</span><span>${c.met ? `<span class="gx-tick" aria-hidden="true">${CHECK}</span> ` : ''}${esc(c.amount != null ? c.amount : c.needed > 0 ? `${fmt(c.earned)} of ${fmt(c.needed)}` : '')}</span></li>`).join('');
    const rows = (d.rows || []).map(rowHTML).join('');
    return (cats ? `<ul class="gx-cats">${cats}</ul>` : '') + (rows ? `<ul class="gx-rows">${rows}</ul>` : '');
  }

  function reqHTML(q) {
    const st = q.met ? { text: 'Complete', done: true } : stateOf(q);
    const body = q.detail ? detailHTML(q.detail) : '';
    const waiting = partial && q.hasDetail && !q.loaded; // still being read from myGCC
    return `<details class="gx-req${q.met ? ' is-met' : ''}" data-key="${esc(q.name)}"${q.met ? '' : ' open'}>`
      + `<summary><span class="gx-name">${esc(q.name)}</span>`
      + `<span class="gx-state${st.done ? ' is-done' : ''}">${st.done ? `<span class="gx-tick" aria-hidden="true">${CHECK}</span> ` : ''}${esc(st.text)}</span></summary>`
      + `<div class="gx-body">${body || `<p class="gx-empty">${waiting ? 'Loading courses from myGCC...' : 'No course detail for this requirement.'}</p>`}</div>`
      + `</details>`;
  }

  function heroHTML(c, gpa) {
    const f = c.needed ? Math.min(1, c.earned / c.needed) : 0;
    const p = c.needed ? Math.min(1 - f, c.progress / c.needed) : 0;
    const R = 70;
    const C = 2 * Math.PI * R;
    const ring = `<svg class="gx-svg" viewBox="0 0 168 168" aria-hidden="true" focusable="false">`
      + `<circle class="gx-track" cx="84" cy="84" r="${R}"></circle>`
      + `<circle class="gx-prog" cx="84" cy="84" r="${R}" stroke-dasharray="${(p * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-f * C).toFixed(2)}"></circle>`
      + `<circle class="gx-earned" cx="84" cy="84" r="${R}" stroke-dasharray="${(f * C).toFixed(2)} ${C.toFixed(2)}"></circle>`
      + `</svg>`;
    const facts = [
      c.needed ? `<strong>${fmt(c.earned)}</strong> of ${fmt(c.needed)} credits earned` : `<strong>${fmt(c.earned)}</strong> credits earned`,
      `${fmt(c.progress)} in progress`,
      // Shown plainly here; the "Hide GPA" setting only covers the dashboard (My Info).
      gpa ? `Overall GPA ${esc(gpa)}` : '',
    ].filter(Boolean).map((l) => `<p>${l}</p>`).join('');
    return `<div class="gx-hero"><div class="gx-ring">${ring}<span class="gx-pct">${Math.round(f * 100)}%</span></div>`
      + `<div class="gx-facts">${facts}</div></div>`;
  }

  let root = null;      // #gccx-degree, while the roadmap is showing
  let hiddenEls = [];   // portlet children we hid
  let current = null;   // { data, ts } currently rendered
  let partial = false;  // current is a first load still filling in requirement details
  let step = null;      // { done, total } while details are loading
  let busy = false;
  let note = '';
  let gen = 0;          // bumped on every build and teardown; async work compares to drop stale results
  let ctl = null;       // AbortController for this build's requests
  const undos = [];

  function warn(msg, extra) {
    try { if (window.GCCX && GCCX.log) GCCX.log('warn', 'content', `[degree] ${msg}`, extra); } catch (e) { /* logging is best effort */ }
  }
  // Run one independent feature; if it throws, log and undo it so the others keep working.
  function safe(name, run, undo) {
    try { run(); undos.push(undo); return true; } catch (e) {
      warn(`${name} failed; reverted it`, { error: String(e && e.message || e), stack: e && e.stack });
      try { undo(); } catch (e2) { warn(`${name} undo failed`, { error: String(e2) }); }
      return false;
    }
  }

  function footHTML() {
    const bits = [];
    if (current && !partial) bits.push(`Updated ${new Date(current.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    const count = step && step.total ? ` (${step.done} of ${step.total} requirements)` : '';
    bits.push(busy ? (partial ? `Loading course details from myGCC...${count}` : `Updating from myGCC...${count}`) : note);
    const msg = bits.filter(Boolean).join(' · ');
    return `<div class="gx-foot"><span>${esc(msg)}</span>`
      + `<button type="button" class="gx-refresh" data-gccx-refresh${busy ? ' disabled' : ''}>Refresh</button></div>`;
  }

  // myGCC's own page stays visible until the roadmap has something to show in its place.
  function showOriginal(on) {
    hiddenEls.forEach((el) => (on ? el.removeAttribute(HIDDEN_ATTR) : el.setAttribute(HIDDEN_ATTR, '')));
  }

  function paint() {
    if (!root) return;
    showOriginal(!current);
    // keep whatever the reader opened or closed across re-renders
    const open = new Map([...root.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]));
    root.innerHTML = current
      ? heroHTML(current.data.credits, current.data.gpa)
        + `<div class="gx-reqs">${current.data.reqs.map(reqHTML).join('') || '<p class="gx-empty">No requirements listed.</p>'}</div>`
        + footHTML()
      : '<p class="gx-status">Building your degree roadmap from myGCC...</p>';
    root.querySelectorAll('details[data-key]').forEach((d) => {
      if (open.has(d.dataset.key)) d.open = open.get(d.dataset.key);
    });
  }

  // ---------- controller ----------
  function mountRoadmap(portlets) {
    root = document.createElement('section');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'Degree roadmap');
    hiddenEls = [...portlets.children]; // hidden by paint() once there is a roadmap to show
    portlets.insertBefore(root, portlets.firstChild);
    root.addEventListener('click', onClick);
  }
  // Remove the roadmap and bring the portal's own content back. Safe to call twice.
  function restoreOriginal() {
    if (root) { root.removeEventListener('click', onClick); root.remove(); }
    root = null;
    hiddenEls.forEach((el) => el.removeAttribute(HIDDEN_ATTR));
    hiddenEls = [];
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => el.removeAttribute(HIDDEN_ATTR));
  }

  async function refresh() {
    if (busy) return;
    const g = gen;
    busy = true;
    note = '';
    paint();
    let error = null;
    let data = null;
    // With nothing saved, show the summary as soon as it is read and fill in details as they arrive.
    // A saved roadmap stays on screen until the new one is complete.
    const firstLoad = !current;
    const onStep = (summary, done, total) => {
      if (g !== gen) return;
      step = { done, total };
      if (firstLoad) { partial = true; current = { data: summary, ts: Date.now() }; }
      paint();
    };
    try {
      data = await loadAll(g, firstLoad, onStep);
    } catch (e) {
      error = e;
    }
    if (g !== gen) return; // torn down meanwhile; teardown already reset the state
    step = null;
    partial = false;
    if (data) {
      current = { data, ts: Date.now() };
      try { await store.set(CACHE_KEY, { ts: current.ts, user: userKey(), data }); } catch (e) { /* cache is optional */ }
      if (g !== gen) return;
    }
    busy = false;
    if (error) {
      warn(`refresh failed: ${String(error && error.message || error)}`);
      if (!current) { restoreOriginal(); return; }
      note = 'Could not refresh. Showing saved data.';
    }
    paint();
  }

  function startPrefill(code) {
    window.GCCX.handoff.put('session', PREFILL_KEY, code, 60000); // picked up by runPrefill on Add/Drop within a minute
    if (window.GCCX && window.GCCX.go) window.GCCX.go(ADD_DROP); else location.href = ADD_DROP;
  }

  function onClick(e) {
    const find = e.target.closest('[data-gccx-find]');
    if (find) { startPrefill(find.dataset.gccxFind); return; }
    if (e.target.closest('[data-gccx-refresh]')) refresh();
  }

  async function init(g) {
    const here = window.GCCX && window.GCCX.loc ? window.GCCX.loc() : location; // differs from location only in the demo
    if (!/My_Degree_Progress/i.test(here.search)) return;
    const portlets = document.getElementById('portlets');
    if (!portlets || document.getElementById(ROOT_ID)) return;
    if (!safe('roadmap', () => mountRoadmap(portlets), restoreOriginal)) return;

    try {
      const user = userKey();
      let hit = null;
      try { hit = await store.get(CACHE_KEY); } catch (e) { /* no cache */ }
      if (g !== gen) return;
      const usable = !!(hit && hit.user === user && hit.data);
      if (usable) { current = { data: hit.data, ts: hit.ts }; paint(); }
      if (!usable || Date.now() - hit.ts >= TTL) await refresh();
    } catch (e) {
      warn(`roadmap failed; restored the original page: ${String(e && e.message || e)}`, { stack: e && e.stack });
      if (g === gen) restoreOriginal();
    }
  }

  // Add/Drop: if the roadmap sent us here with a course to look up, fill the search and run it.
  // Filling the fields is undone on teardown; the search click itself is a server postback and cannot be.
  function runPrefill() {
    const box = document.querySelector('[id$="tabSearch_txtCourseRestrictor"]');
    if (!box) return null; // not the search screen: leave the handoff for the page that has the box (it expires by itself)
    const code = window.GCCX.handoff.take('session', PREFILL_KEY);
    if (!code) return null;
    const sel = document.querySelector('[id$="tabSearch_ddlCourseRestrictor"]');
    const prev = { box, boxVal: box.value, sel, selVal: sel ? sel.value : '' };
    box.value = code;
    const opt = sel && [...sel.options].find((o) => /begins/i.test(o.text));
    if (opt) sel.value = opt.value;
    const go = document.querySelector('[id$="tabSearch_btnSearch"]');
    if (go) go.click();
    return prev;
  }

  function build() {
    gen++;
    ctl = new AbortController();
    let prev = null;
    safe('prefill', () => { prev = runPrefill(); }, () => {
      if (!prev) return;
      if (prev.box.isConnected) prev.box.value = prev.boxVal;
      if (prev.sel && prev.sel.isConnected) prev.sel.value = prev.selVal;
      prev = null;
    });
    init(gen).catch((e) => warn(`init failed: ${String(e && e.message || e)}`));
  }

  function teardown() {
    gen++;
    if (ctl) { try { ctl.abort(); } catch (e) { /* already aborted */ } ctl = null; }
    busy = false;
    current = null;
    partial = false;
    step = null;
    note = '';
    undos.splice(0).reverse().forEach((u) => { try { u(); } catch (e) { warn('teardown step failed', { error: String(e && e.message || e) }); } });
    restoreOriginal();
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
