// aBetterMyGCC content script. Runs on every my.gcc.edu/ICS page for whoever is
// signed in. All data is read from the user's own myGCC pages and kept in
// chrome.storage.local on this computer.
(function () {
  'use strict';
  const X = window.GCCX;
  const root = document.documentElement;

  const DEFAULTS = { enabled: true, theme: 'auto', dashboard: true, hidePromos: true, hall: 'hicks-cafe' };
  const TTL = { schedule: 6 * 3600e3, degree: 24 * 3600e3, chapel: 3 * 3600e3, balance: 6 * 3600e3, nav: 24 * 3600e3, pageIndex: 24 * 3600e3, standing: 24 * 3600e3, registration: 6 * 3600e3 };

  // ---- apply look synchronously (mirrored to localStorage to avoid a flash) ----
  let settings = { ...DEFAULTS, ...safeJSON(localStorage.getItem('gccx-settings')) };
  applyLook();
  injectFont();

  chrome.storage.local.get('settings', ({ settings: s }) => {
    settings = { ...DEFAULTS, ...(s || {}) };
    localStorage.setItem('gccx-settings', JSON.stringify(settings));
    applyLook();
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.settings) {
      settings = { ...DEFAULTS, ...(ch.settings.newValue || {}) };
      localStorage.setItem('gccx-settings', JSON.stringify(settings));
      applyLook();
      renderDashboard();
    }
    if (ch.chapel) renderDashboard();
  });

  function applyLook() {
    root.classList.toggle('gccx', settings.enabled);
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('gccx-dark', settings.enabled && dark);
    root.classList.toggle('gccx-nobanner', settings.enabled && settings.hidePromos);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

  function injectFont() {
    if (document.getElementById('gccx-font')) return;
    const l = document.createElement('link');
    l.id = 'gccx-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&display=swap';
    (document.head || root).appendChild(l);
  }

  // ---------------- storage helpers ----------------
  const store = {
    get: (k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o[k]))),
    set: (k, v) => new Promise((r) => chrome.storage.local.set({ [k]: v }, r)),
  };
  async function cached(key, loader, force) {
    const hit = await store.get(key);
    const user = currentUserKey();
    if (!force && hit && hit.user === user && Date.now() - hit.ts < TTL[key]) return hit.data;
    try {
      const data = await loader();
      if (data != null) await store.set(key, { ts: Date.now(), user, data });
      return data ?? (hit && hit.user === user ? hit.data : null);
    } catch (e) {
      console.warn('[aBetterMyGCC]', key, e);
      return hit && hit.user === user ? hit.data : null;
    }
  }
  // cache is keyed to the signed-in person so shared computers never mix data
  function currentUserKey() {
    const u = X.parseUser(document);
    return u ? u.name : null;
  }
  async function getDoc(url, init) {
    const res = await fetch(url, { credentials: 'include', ...init });
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // ---------------- loaders ----------------
  const SCHEDULE_URL = '/ICS/Academics/Home.jnz?portlet=Student_Schedule';
  const DEGREE_URL = '/ICS/Academics/Home.jnz?portlet=My_Degree_Progress';
  const CHAPEL_URL = '/ICS/My_Info/Student.jnz?portlet=Universal_Portlet';
  const BALANCE_URL = '/ICS/Financial/Student_Accounts.jnz?portlet=CASHNet_My_Account_Info';
  const REG_URL = '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses';

  // Post an ASP.NET form the way the browser would (optionally firing a postback).
  function postForm(doc, url, extra) {
    const form = doc.querySelector('form');
    if (!form) return null;
    const body = new URLSearchParams();
    form.querySelectorAll('input[name], select[name]').forEach((i) => {
      if (['submit', 'button', 'image', 'checkbox', 'radio'].includes(i.type)) return;
      body.set(i.name, i.value || '');
    });
    Object.entries(extra || {}).forEach(([k, v]) => body.set(k, v));
    const action = new URL(form.getAttribute('action') || url, location.origin + url).href;
    return getDoc(action, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const portletText = (doc) => [...doc.querySelectorAll('.portlet')].map((p) => p.textContent).join(' ');

  // The schedule page opens on whichever term myGCC last showed (often next
  // term once you pre-register). Walk the term list until one covers today.
  const loadSchedule = (f) => cached('schedule', async () => {
    let doc = await getDoc(SCHEDULE_URL);
    let sched = X.parseSchedule(doc);
    const covers = (s) => s && s.courses.some((c) => c.start && c.end && Date.now() >= new Date(c.start) && Date.now() <= +new Date(c.end) + 864e5);
    if (covers(sched)) return sched;
    const sel = [...doc.querySelectorAll('select')].find((s) => [...s.options].some((o) => /semester|term|summer|winter/i.test(o.textContent)));
    if (!sel || !sel.name) return sched;
    const opts = [...sel.options];
    const now = new Date();
    // Try terms whose name mentions this year or last year, nearest first
    const cands = opts.filter((o) => !o.selected && new RegExp(`${now.getFullYear()}|${now.getFullYear() - 1}`).test(o.textContent)).slice(0, 4);
    for (const o of cands) {
      const btn = doc.querySelector('.portlet input[type=submit][name$="btnSearch"]');
      const extra = btn ? { [sel.name]: o.value, [btn.name]: btn.value, __EVENTTARGET: '', __EVENTARGUMENT: '' } : { [sel.name]: o.value, __EVENTTARGET: sel.name, __EVENTARGUMENT: '' };
      const d = await postForm(doc, SCHEDULE_URL, extra);
      const s = d && X.parseSchedule(d);
      if (covers(s)) return s;
      if (d) doc = d;
    }
    return sched;
  }, f);
  const loadDegree = (f) => cached('degree', async () => X.parseDegree(await getDoc(DEGREE_URL)), f);

  // GPA, credits earned and hours needed for the command-center hero bar.
  const loadStanding = (f) => cached('standing', async () => {
    let doc = await getDoc(DEGREE_URL);
    if (!doc.querySelector('[id$="dgRequirementSummary"]')) {
      const btn = doc.querySelector('[id$="btnViewDetails"]');
      const m = /__doPostBack\('([^']+)'/.exec(btn?.getAttribute('href') || '');
      if (!m) return null;
      doc = await postForm(doc, DEGREE_URL, { __EVENTTARGET: m[1], __EVENTARGUMENT: '' });
      if (!doc) return null;
    }
    const text = portletText(doc);
    const num = (s) => { const v = parseFloat(s); return Number.isNaN(v) ? null : v; };
    const grab = (re) => num((re.exec(text) || [])[1]);
    const gpa = grab(/Overall GPA:\s*([\d.]+)/i);
    const earned = grab(/Credits Earned:\s*([\d.]+)/i);
    let needed = null, inProgress = null;
    const tbl = doc.querySelector('[id$="dgRequirementSummary"]');
    const rows = tbl ? [...tbl.querySelectorAll('tr')] : [];
    const total = rows.filter((r) => /^Total Credits/i.test(X.clean(r.cells[0]?.textContent))).pop();
    if (total) {
      const hdr = rows.find((r) => r.querySelector('th'));
      const H = hdr ? [...hdr.cells].map((c) => X.clean(c.textContent)) : [];
      const col = (re, dflt) => { const i = H.findIndex((h) => re.test(h)); return i >= 0 ? i : dflt; };
      needed = num(X.clean(total.cells[col(/hours needed/i, 3)]?.textContent));
      inProgress = num(X.clean(total.cells[col(/in progress/i, 5)]?.textContent));
    }
    if (gpa == null && earned == null && needed == null) return null;
    return { gpa, earned, needed, inProgress };
  }, f);

  // Registration is open when the Add/Drop portlet for a later term says "Add Period Open".
  const findOpenTerm = async () => {
    const doc = await getDoc(REG_URL);
    const sel = doc.querySelector('select[id$="ddlTerm"]');
    if (!sel || !sel.name) return null;
    const termKey = (v) => { const m = /^(\d{4});(\d{2})$/.exec(v || ''); return m ? +m[1] * 100 + +m[2] : null; };
    const cur = termKey(sel.value) ?? -Infinity;
    const next = [...sel.options]
      .map((o) => ({ value: o.value, term: X.clean(o.textContent), k: termKey(o.value) }))
      .filter((o) => o.k != null && o.k > cur)
      .sort((a, b) => b.k - a.k)
      .slice(0, 2);
    let found = null;
    try {
      for (const o of next) {
        const d = await postForm(doc, REG_URL, { [sel.name]: o.value, __EVENTTARGET: sel.name, __EVENTARGUMENT: '' });
        if (d && /Add Period Open/i.test(portletText(d))) { found = { term: o.term, value: o.value }; break; }
      }
    } finally {
      // leave myGCC on its default view after the term postbacks
      if (next.length) await getDoc(REG_URL).catch(() => null);
    }
    return found;
  };
  // Cache a wrapper so "nothing open" is a stored result, not a null that cached() would replace with a stale hit.
  const loadRegistration = async (f) => {
    const hit = await cached('registration', async () => ({ open: await findOpenTerm() }), f);
    return (hit && hit.open) || null;
  };

  // Account balances sit behind a postback and a "Please Wait" screen.
  const loadBalance = (f) => cached('balance', async () => {
    let doc = await getDoc(BALANCE_URL);
    let triedLink = false;
    for (let i = 0; i < 8; i++) {
      const found = X.parseBalances(doc);
      if (found) return found;
      if (/^wait$/i.test(doc.title.trim())) { await sleep(1200); doc = await postForm(doc, BALANCE_URL); continue; }
      const link = [...doc.querySelectorAll('.portlet a[href*="__doPostBack"]')].find((a) => /account balances/i.test(a.textContent));
      if (!link || triedLink) return null;
      triedLink = true;
      doc = await postForm(doc, BALANCE_URL, { __EVENTTARGET: /__doPostBack\('([^']+)'/.exec(link.getAttribute('href'))[1], __EVENTARGUMENT: '' });
      if (!doc) return null;
    }
    return null;
  }, f);

  // Chapel numbers live in a frame on custom.gcc.edu; chapel.js reads that frame.
  async function loadChapel(force) {
    const hit = await store.get('chapel');
    const user = currentUserKey();
    const fresh = hit && hit.user === user && Date.now() - hit.ts < TTL.chapel;
    if (!fresh || force) {
      try {
        const doc = await getDoc(CHAPEL_URL);
        const src = doc.querySelector('iframe[src*="chapel"]')?.getAttribute('src');
        if (src && !document.getElementById('gccx-chapel-frame')) {
          await store.set('chapelPending', { user, ts: Date.now() });
          const f = document.createElement('iframe');
          f.id = 'gccx-chapel-frame';
          f.src = src;
          f.setAttribute('aria-hidden', 'true');
          f.tabIndex = -1;
          document.body.appendChild(f);
          setTimeout(() => f.remove(), 20000);
        } else if (!src && !hit) {
          await store.set('chapel', { ts: Date.now(), user, data: null });
        }
      } catch (e) { console.warn('[aBetterMyGCC] chapel', e); }
    }
    return hit && hit.user === user ? hit.data : null;
  }

  // Opportunistic scraping: whenever the user opens one of these pages
  // themselves, refresh the cache from what is on screen.
  function scrapeCurrentPage() {
    const user = currentUserKey();
    if (!user) return;
    const p = (location.pathname + location.search).toLowerCase();
    if (p.includes('student_schedule')) { const d = X.parseSchedule(document); if (d && d.courses.length) store.set('schedule', { ts: Date.now(), user, data: d }); }
    if (p.includes('my_degree_progress')) { const d = X.parseDegree(document); if (d) store.set('degree', { ts: Date.now(), user, data: d }); }
    if (document.querySelector('iframe[src*="chapel.aspx"]')) store.set('chapelPending', { user, ts: Date.now() });
    const b = X.parseBalances(document);
    if (b) store.set('balance', { ts: Date.now(), user, data: b });
  }

  // ---------------- dashboard ----------------
  let state = { schedule: null, degree: null, standing: null, registration: null, chapel: null, balance: null, menu: null, loading: true };

  function isHome() {
    const p = location.pathname.replace(/\/+$/, '').toLowerCase();
    return (p === '/ics' || p === '/ics/portal_homepage.jnz' || p === '/ics/default.aspx') && !/portlet=/i.test(location.search);
  }

  async function initDashboard(force) {
    if (!isHome() || !currentUserKey()) return;
    const tasks = [
      loadSchedule(force).then((d) => (state.schedule = d)),
      loadDegree(force).then((d) => (state.degree = d)),
      loadStanding(force).then((d) => (state.standing = d)),
      loadRegistration(force).then((d) => (state.registration = d)),
      loadChapel(force).then((d) => (state.chapel = d)),
      loadBalance(force).then((d) => (state.balance = d)),
      loadMenu().then((d) => (state.menu = d)),
    ];
    renderDashboard();
    await Promise.allSettled(tasks.map((t) => t.then(renderDashboard)));
    state.loading = false;
    renderDashboard();
  }

  function loadMenu() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'menu', hall: settings.hall }, (r) => resolve(chrome.runtime.lastError ? null : r));
    });
  }

  async function renderDashboard() {
    if (!isHome()) return;
    const host = document.querySelector('#portlet-grid');
    if (!settings.enabled || !settings.dashboard || !host) {
      document.getElementById('gccx-dash')?.remove();
      root.classList.remove('gccx-home');
      document.getElementById('gccx-more')?.remove();
      document.querySelectorAll('[data-gccx-hidden]').forEach((e) => { e.hidden = false; e.removeAttribute('data-gccx-hidden'); });
      return;
    }
    const chapelHit = await store.get('chapel');
    if (chapelHit && chapelHit.user === currentUserKey()) state.chapel = chapelHit.data;

    // Look up after the await: several renders can be in flight at once
    const old = document.getElementById('gccx-dash');
    root.classList.add('gccx-home');
    const el = old || Object.assign(document.createElement('section'), { id: 'gccx-dash' });
    el.setAttribute('aria-label', 'Your day');
    el.innerHTML = dashboardHTML();
    if (!old) {
      host.parentNode.insertBefore(el, host);
      if (!document.getElementById('gccx-more')) {
        const more = Object.assign(document.createElement('h3'), { id: 'gccx-more', textContent: 'From myGCC' });
        host.parentNode.insertBefore(more, host);
      }
      // Decorative portlets that add nothing once the dashboard exists
      document.querySelectorAll('.portlet').forEach((p) => {
        if (/pi_Welcome|pi_Free_form_Content\b/.test(p.className) && /welcome|instagram/i.test(p.querySelector('h3')?.textContent || '')) {
          p.hidden = true; p.setAttribute('data-gccx-hidden', '');
        }
      });
      const pt = document.querySelector('#PageBar_pageTitle'); if (pt) { pt.hidden = true; pt.setAttribute('data-gccx-hidden', ''); }
    }
    el.querySelector('[data-refresh]')?.addEventListener('click', () => {
      ['schedule', 'degree', 'standing', 'registration', 'chapel', 'balance'].forEach((k) => chrome.storage.local.remove(k));
      state = { ...state, loading: true };
      initDashboard(true);
    });
    el.querySelectorAll('[data-hall]').forEach((b) => b.addEventListener('click', async () => {
      settings.hall = b.dataset.hall;
      await store.set('settings', settings);
      state.menu = await loadMenu();
      renderDashboard();
    }));
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Command-center bar under the greeting. A stat is left out when its data is missing.
  function heroHTML() {
    const stats = [];
    const sg = state.standing;
    const ch = state.chapel;
    if (sg && sg.gpa != null) stats.push({ href: DEGREE_URL, num: esc(sg.gpa.toFixed(2)), label: 'GPA' });
    if (sg && sg.earned != null) stats.push({ href: DEGREE_URL, num: `${esc(sg.earned)}${sg.needed > 0 ? `<small> of ${esc(sg.needed)}</small>` : ''}`, label: 'Credits earned' });
    if (state.schedule && state.schedule.courses.length) {
      const credits = state.schedule.courses.reduce((s, c) => s + (c.credits || 0), 0);
      stats.push({ href: SCHEDULE_URL, num: esc(credits), label: 'credits registered', title: 'This term' });
    }
    if (ch && ch.required != null) {
      const done = (ch.attended || 0) + (ch.special || 0);
      const need = (ch.required || 0) + (ch.rollover || 0);
      stats.push({ href: CHAPEL_URL, num: `${esc(done)}<small> of ${esc(need)}</small>`, label: 'Chapel' });
    }
    if (!stats.length) return '';
    return `<div class="x-hero">${stats.map((s) => `<a class="x-hero-stat" href="${esc(s.href)}"${s.title ? ` title="${s.title}"` : ''}><span class="x-hero-num">${s.num}</span><span class="x-hero-label">${esc(s.label)}</span></a>`).join('')}</div>`;
  }

  function registrationCard() {
    const r = state.registration;
    if (!r) return '';
    return `<div class="x-card x-reg"><h3>Registration is open for ${esc(r.term)}</h3>
      <p>Plan your schedule, see conflicts on a calendar, and register for everything at once.</p>
      <a class="x-reg-btn" href="${REG_URL}">Open the planner</a></div>`;
  }

  function dashboardHTML() {
    const now = new Date();
    const user = X.parseUser(document);
    const hour = now.getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const hero = heroHTML();
    const reg = registrationCard();
    const left = todayCard(now);
    const glance = glanceCard();
    const dining = diningCard(now);
    return `
      <div class="x-hello"><h2>${greet}${user && user.first ? ', ' + esc(user.first) : ''}</h2><span class="x-date">${dateStr}</span></div>
      ${hero}
      <div class="x-grid">
        <div>${reg}${left}${dining}</div>
        <div>${glance}</div>
      </div>
      <div class="x-foot"><span>${state.loading ? 'Updating…' : 'Up to date'}</span><button type="button" data-refresh>Refresh</button></div>`;
  }

  function inTerm(c, d) {
    if (!c.start || !c.end) return true;
    const t = d.getTime();
    return t >= new Date(c.start).getTime() && t <= new Date(c.end).getTime() + 864e5;
  }
  function classesOn(d) {
    const s = state.schedule;
    if (!s) return [];
    const dow = d.getDay();
    const list = [];
    for (const c of s.courses) {
      if (!inTerm(c, d)) continue;
      for (const m of c.meetings) if (m.days.includes(dow)) list.push({ c, m });
    }
    return list.sort((a, b) => a.m.start - b.m.start);
  }
  function courseHref(code) {
    const parts = code.split(/\s+/); // "COMP 222 B"
    const a = [...document.querySelectorAll('a[href*="/ICS/Academics/"]')].find((x) => x.textContent.trim().toUpperCase().startsWith(code.toUpperCase()));
    return a ? a.href : parts.length >= 2 ? null : null;
  }

  function todayCard(now) {
    const s = state.schedule;
    if (!s && state.loading) return `<div class="x-card"><h3>Today</h3><p class="x-empty">Loading your schedule…</p></div>`;
    if (!s || !s.courses.length) return '';
    const mins = now.getHours() * 60 + now.getMinutes();
    let list = classesOn(now);
    let heading = 'Today';
    let showDay = null;
    if (!list.length || list.every((x) => x.m.end <= mins)) {
      // Nothing left today: show the next day that has classes
      for (let i = 1; i <= 7; i++) {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const l = classesOn(d);
        if (l.length) { showDay = d; heading = i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }); break; }
      }
    }
    const rows = [];
    let nextMarked = false;
    const day = showDay || now;
    const items = showDay ? classesOn(showDay) : list;
    for (const { c, m } of items) {
      let cls = '', when = '';
      if (!showDay) {
        if (m.end <= mins) cls = 'is-past';
        else if (m.start <= mins) { cls = 'is-now'; when = `Ends in ${dur(m.end - mins)}`; }
        else if (!nextMarked) { cls = 'is-next'; when = `In ${dur(m.start - mins)}`; nextMarked = true; }
      }
      const href = courseHref(c.code);
      rows.push(`<div class="x-class ${cls}">
        <div class="x-time">${X.fmtTime(m.start)}${when ? `<span class="x-when">${when}</span>` : ''}</div>
        <div><div class="x-title">${href ? `<a href="${esc(href)}">${esc(c.title)}</a>` : esc(c.title)}</div>
          <div class="x-sub">${esc(c.code)}${c.instructor ? ' · ' + esc(shortName(c.instructor)) : ''}</div></div>
        <div class="x-room">${esc(m.room)}</div></div>`);
    }
    const online = s.courses.filter((c) => c.online && inTerm(c, day));
    const onlineNote = online.length ? `<p class="x-muted" style="margin:12px 0 0;font-size:14.5px">Online, no set meeting time: ${online.map((c) => esc(c.title)).join(', ')}</p>` : '';
    const body = rows.length ? rows.join('') : `<p class="x-empty">No classes this week.</p>`;
    return `<div class="x-card"><h3>${heading}<a class="x-aside" href="${SCHEDULE_URL}">Full schedule</a></h3>${body}${onlineNote}</div>`;
  }
  function dur(m) {
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} hr ${r} min` : `${h} hr`;
  }
  function shortName(s) {
    // "Wolfe, Dr. Britton D." -> "Dr. Wolfe"
    const first = s.split(';')[0];
    const m = /^([^,]+),\s*(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)?/.exec(first);
    return m ? `${m[2] ? m[2] + ' ' : ''}${m[1].trim()}` : first;
  }

  function glanceCard() {
    const parts = [];
    const ch = state.chapel;
    if (ch && ch.required != null) {
      const done = (ch.attended || 0) + (ch.special || 0);
      const need = (ch.required || 0) + (ch.rollover || 0);
      const pct = need ? Math.min(100, Math.round((done / need) * 100)) : 100;
      const rem = ch.remaining ?? Math.max(0, need - done);
      parts.push(`<div class="x-stat"><div class="x-row"><span class="x-label"><a href="${CHAPEL_URL}">Chapel</a></span>
        <span class="x-value">${done}<small> of ${need}</small></span></div>
        <div class="x-bar"><i style="width:${pct}%"></i></div>
        <div class="x-note">${rem > 0 ? `${rem} more this semester` : '<span class="x-good">Complete for this semester</span>'}</div></div>`);
    }
    const bal = state.balance;
    if (bal && bal.length) {
      const ar = bal.find((b) => /receivable/i.test(b.label)) || bal[0];
      const fmt = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
      const owed = ar.kind === 'Due' && ar.amount > 0;
      parts.push(`<div class="x-stat"><div class="x-row"><span class="x-label"><a href="${BALANCE_URL}">Student account</a></span>
        <span class="x-value ${owed ? 'x-warn' : ''}">${fmt(ar.amount)}</span></div>
        <div class="x-note">${ar.amount === 0 ? 'Nothing due' : owed ? 'Amount due' : 'Credit on your account'}</div></div>`);
    }
    const dg = state.degree;
    if (dg && dg.reqs.length) {
      const met = dg.reqs.filter((r) => r.met).length;
      const open = dg.reqs.filter((r) => !r.met);
      parts.push(`<div class="x-stat"><div class="x-row"><span class="x-label"><a href="${DEGREE_URL}">Degree requirements</a></span>
        <span class="x-value">${met}<small> of ${dg.reqs.length} met</small></span></div>
        ${open.length ? `<ul class="x-reqs">${open.map((r) => `<li>${esc(r.name.replace(/\s*=\s*/, ' '))}</li>`).join('')}</ul>` : ''}</div>`);
    }
    if (!parts.length) return state.loading ? `<div class="x-card"><h3>At a glance</h3><p class="x-empty">Loading…</p></div>` : '';
    return `<div class="x-card"><h3>At a glance</h3>${parts.join('')}</div>`;
  }

  function diningCard(now) {
    const m = state.menu;
    const halls = [['hicks-cafe', 'Hicks'], ['map-cafe', 'MAP']];
    const seg = `<span class="x-seg" role="group" aria-label="Dining hall">${halls.map(([slug, label]) => `<button type="button" data-hall="${slug}" aria-pressed="${settings.hall === slug}">${label}</button>`).join('')}</span>`;
    if (!m) return state.loading ? '' : '';
    let body;
    if (m.closed) body = `<p class="x-empty">${esc(m.message || 'Closed right now.')}</p>`;
    else if (!m.stations || !m.stations.length) body = `<p class="x-empty">No menu posted.</p>`;
    else body = `<div class="x-stations">${m.stations.slice(0, 6).map((s) => `<div class="x-station"><h4>${esc(s.name)}</h4><p>${s.items.slice(0, 5).map(esc).join(', ')}</p></div>`).join('')}</div>`;
    const sub = m.meal ? `<p class="x-meal">${esc(m.meal)}${m.until ? ' until ' + esc(m.until) : ''}${m.later ? ' · later today' : ''}</p>` : '';
    return `<div class="x-card"><h3>Dining${seg}</h3>${sub}${body}</div>`;
  }

  // ---------------- search palette (Ctrl/Cmd+K or /) ----------------
  let navIndex = null;
  async function buildIndex() {
    if (navIndex) return navIndex;
    const base = X.parseNav(document, location.href);
    const extra = await cached('nav', async () => {
      const tabs = [...document.querySelectorAll('#main-nav > li > a')].map((a) => ({ href: a.href, label: a.textContent.trim() }));
      const all = [];
      await Promise.all(tabs.map(async (t) => {
        try {
          const d = await getDoc(t.href);
          d.querySelectorAll('#this-context-pages a, #contextPages a').forEach((a) => {
            const href = a.getAttribute('href');
            const label = X.clean(a.textContent);
            if (href && label && !href.startsWith('#') && !href.startsWith('javascript')) all.push({ label, href: new URL(href, location.origin).href, group: t.label });
          });
        } catch (e) { /* skip tab */ }
      }));
      return all;
    });
    const seen = new Set();
    navIndex = [...base, ...(extra || [])].filter((l) => {
      const k = l.label.toLowerCase() + '|' + l.href.replace(/[#].*$/, '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return navIndex;
  }

  // ---- content index: visible text of each page, built quietly in the background ----
  const PAGE_MAX = 120, PAGE_TEXT = 1500, PAGE_BYTES = 250000;
  const pageKey = (href) => String(href).replace(/#.*$/, '');
  const idxState = { running: false, done: 0, total: 0 };
  let pageMap = new Map(); // page key -> text
  let pagePromise = null;
  function pageText(doc, max) {
    const el = doc.querySelector('#portlets');
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('script, style, noscript, template, select').forEach((n) => n.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  async function crawlPages(nav) {
    const seen = new Set();
    const list = [];
    for (const l of nav) {
      let u;
      try { u = new URL(l.href, location.origin); } catch (e) { continue; }
      if (u.origin !== location.origin || !/^\/ICS/i.test(u.pathname)) continue;
      if (/\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif)$/i.test(u.pathname) || /log(out|off)|signout/i.test(u.pathname + u.search)) continue;
      const k = pageKey(u.href);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ title: l.label, href: k, group: l.group || '' });
      if (list.length >= PAGE_MAX) break;
    }
    idxState.running = true; idxState.done = 0; idxState.total = list.length;
    refreshPalette();
    const out = [];
    let bytes = 0, next = 0;
    const worker = async () => {
      while (next < list.length) {
        const it = list[next++];
        try {
          if (bytes < PAGE_BYTES) {
            const text = pageText(await getDoc(it.href), PAGE_TEXT);
            if (text) { out.push({ ...it, text }); bytes += text.length + it.title.length + it.href.length; }
          }
        } catch (e) { /* skip page */ }
        idxState.done++;
        refreshPalette();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out.length ? out : null;
  }
  function ensurePageIndex() {
    if (!pagePromise) {
      pagePromise = (async () => {
        const nav = await buildIndex();
        const data = (await cached('pageIndex', () => crawlPages(nav))) || [];
        pageMap = new Map(data.map((p) => [pageKey(p.href), p.text]));
        idxState.running = false;
        refreshPalette(true);
        return data;
      })();
    }
    return pagePromise;
  }
  function refreshPalette(redraw) {
    const p = document.getElementById('gccx-palette');
    if (!p || !p._hint) return;
    p._hint();
    if (redraw) p._draw();
  }

  // ---- ranking ----
  const STOP = new Set('a an the to of for and or in on at is are was be i my me we do does did how can what where when who why which should it this that with about'.split(' '));
  function tokenize(q) {
    const all = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const keep = all.filter((t) => !STOP.has(t) && t.length > 1);
    return [...new Set(keep.length ? keep : all)];
  }
  function countIn(hay, t, cap) {
    let n = 0, i = hay.indexOf(t);
    while (i >= 0 && n < cap) { n++; i = hay.indexOf(t, i + t.length); }
    return n;
  }
  // item: {label, group, text}. Title matches beat body matches; matching every word beats matching some.
  function score(item, q) {
    if (!q) return 1;
    const toks = tokenize(q);
    if (!toks.length) return 0;
    const l = item.label.toLowerCase(), g = (item.group || '').toLowerCase(), body = (item.text || '').toLowerCase();
    let s = 0, hit = 0;
    if (l.startsWith(q)) s += 40; else if (l.includes(q)) s += 20;
    for (const t of toks) {
      let w = l.startsWith(t) || l.includes(' ' + t) ? 12 : l.includes(t) ? 8 : g.includes(t) ? 4 : 0;
      const n = body ? countIn(body, t, 5) : 0;
      if (n) w = w ? w + 1 : 3 + n * 0.5;
      if (w) hit++;
      s += w;
    }
    if (hit === toks.length) return s + 100;
    if (hit) return s;
    // typo-tolerant fallback: loose subsequence match on the title
    const c = q.replace(/\s+/g, '');
    if (c.length < 3) return 0;
    let i = 0;
    for (const ch of l) if (ch === c[i]) i++;
    return i === c.length ? 2 : 0;
  }
  function entries() {
    return (navIndex || []).map((l) => ({ label: l.label, href: l.href, group: l.group || '', text: pageMap.get(pageKey(l.href)) || '' }));
  }
  function searchEntries(q, limit) {
    const best = new Map();
    for (const it of entries()) {
      const s = score(it, q);
      const k = pageKey(it.href);
      if (s > 0 && (!best.has(k) || best.get(k).s < s)) best.set(k, { it, s });
    }
    return [...best.values()].sort((a, b) => b.s - a.s).slice(0, limit);
  }
  function markHTML(text, toks) {
    const alt = toks.slice().sort((a, b) => b.length - a.length).map((t) => t.replace(/[^a-z0-9]/g, '')).filter(Boolean).join('|');
    if (!alt) return esc(text);
    return text.split(new RegExp('(' + alt + ')', 'gi')).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
  }
  // a short window of the page text around the first matching word
  function snippetAround(text, toks, len) {
    if (!text) return { s: '', hit: false };
    const low = text.toLowerCase();
    let at = -1;
    for (const t of toks) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return { s: text.slice(0, len), hit: false };
    const start = Math.max(0, at - Math.round(len / 3));
    let s = text.slice(start, start + len);
    if (start > 0) s = '…' + s.replace(/^\S+\s/, '');
    if (start + len < text.length) s += '…';
    return { s, hit: true };
  }
  const snippetHTML = (text, toks) => {
    const r = snippetAround(text, toks, 120);
    return r.hit && toks.length ? markHTML(r.s, toks) : '';
  };

  // ---- Ask AI ----
  const looksLikeQuestion = (q) => /\?\s*$/.test(q) || /^(how|where|when|what|who|can|do|does|is|why)\b/i.test(q.trim());
  const wordCount = (q) => q.trim().split(/\s+/).filter(Boolean).length;
  const askStatus = () => new Promise((r) => { try { chrome.runtime.sendMessage({ type: 'ai-status' }, (x) => r(chrome.runtime.lastError ? null : x)); } catch (e) { r(null); } });
  const askChat = (payload) => new Promise((r) => { try { chrome.runtime.sendMessage({ type: 'ai-chat', ...payload }, (x) => r(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : x)); } catch (e) { r({ error: 'The extension was reloaded. Refresh this page.' }); } });
  const ASK_TOOLS = [
    {
      name: 'search_pages',
      description: 'Search the text of myGCC pages (titles and page content). Returns up to 8 pages with title, url and a snippet of matching text. Use plain keywords, for example "transcript" or "chapel excuse".',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Keywords to look for' } }, required: ['query'], additionalProperties: false },
    },
    {
      name: 'read_page',
      description: 'Read one myGCC page by URL (use a url returned by search_pages or by an earlier read_page). Returns the page text and up to 30 links found on it.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full my.gcc.edu URL' } }, required: ['url'], additionalProperties: false },
    },
  ];
  const ASK_SYSTEM = `You answer a Grove City College student's question about myGCC, the college's student portal.
Use only what you find with your tools: search_pages to find relevant pages, then read_page on the one or two most relevant ones. Don't answer from memory.
Answer in one to four short plain sentences. Then list the one to three most useful pages, each on its own line in exactly this form, with no bullets or markdown:
Link: Page title | https://full-url
If the answer isn't in myGCC, say so plainly and suggest the office or page most likely to help. Never invent URLs, deadlines, dates or policies, and only link pages you saw in tool results.`;
  let askSeq = 0, askRun = null;
  async function searchPagesTool(query) {
    await ensurePageIndex();
    const toks = tokenize(query);
    return searchEntries(String(query || '').toLowerCase().trim(), 8).map(({ it }) => ({
      title: it.label, url: pageKey(it.href), snippet: snippetAround(it.text, toks, 400).s,
    }));
  }
  async function readPageTool(url) {
    let u;
    try { u = new URL(String(url), location.origin); } catch (e) { throw new Error('That is not a valid URL.'); }
    if (u.origin !== location.origin) throw new Error('Only my.gcc.edu pages can be read.');
    const doc = await getDoc(u.href);
    const links = [], seen = new Set();
    doc.querySelectorAll('#portlets a[href]').forEach((a) => {
      const h = a.getAttribute('href'), t = X.clean(a.textContent);
      if (links.length >= 30 || !h || !t || /^(#|javascript:|mailto:)/i.test(h)) return;
      let abs; try { abs = new URL(h, u.href).href; } catch (e) { return; }
      if (seen.has(abs)) return;
      seen.add(abs);
      links.push({ text: t.slice(0, 120), href: abs });
    });
    return { url: pageKey(u.href), text: pageText(doc, 6000) || '(no readable text on this page)', links };
  }
  function parseAnswer(text, seen) {
    const links = [], lines = [];
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      const m = line.match(/^Link:\s*(.+?)\s*\|\s*(\S+)\s*$/i);
      if (!m) { lines.push(line.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '')); continue; }
      try {
        const u = new URL(m[2], location.origin);
        if (u.origin === location.origin && seen.has(pageKey(u.href)) && !links.some((l) => pageKey(l.href) === pageKey(u.href)) && links.length < 3) links.push({ title: m[1].replace(/\*\*/g, ''), href: u.href });
      } catch (e) { /* drop bad link */ }
    }
    return { text: lines.join('\n').replace(/\n{2,}/g, '\n').trim(), links };
  }
  async function runAsk(run) {
    const alive = () => askSeq === run.id;
    const update = () => { if (alive()) document.getElementById('gccx-palette')?._draw(); };
    const seenUrls = new Set((navIndex || []).map((l) => pageKey(l.href)));
    const messages = [{ role: 'user', text: run.q }];
    try {
      for (let turn = 0; turn < 8; turn++) {
        const r = await askChat({ system: ASK_SYSTEM, tools: ASK_TOOLS, messages });
        if (!alive()) return;
        if (!r || r.error) {
          run.error = r && r.kind === 'auth' ? 'Your AI key was rejected. Check it in the aBetterMyGCC popup.' : r && r.kind === 'rate' ? 'The AI service is rate-limiting this key. Try again in a minute.' : `AI request failed: ${r ? r.error : 'no response'}`;
          break;
        }
        const out = r.ok;
        if (out.stop === 'refusal') { run.error = 'The AI service declined this request.'; break; }
        if (out.stop === 'max') { run.error = 'The AI response was cut off. Try asking more simply.'; break; }
        if (out.stop !== 'tool' || !out.toolCalls.length) {
          const a = parseAnswer(out.text, seenUrls);
          run.text = a.text || 'I could not find an answer in myGCC.';
          run.links = a.links;
          break;
        }
        messages.push({ role: 'assistant', native: out.native });
        const results = [];
        for (const call of out.toolCalls) {
          let content, isError = false;
          try {
            const a = call.input || {};
            if (a.__invalid !== undefined) throw new Error('Arguments were not valid JSON.');
            if (call.name === 'search_pages') {
              if (typeof a.query !== 'string' || !a.query.trim()) throw new Error('query is required');
              run.steps.push(`Searching “${a.query.trim()}”…`); update();
              const found = await searchPagesTool(a.query);
              found.forEach((f) => seenUrls.add(pageKey(f.url)));
              content = JSON.stringify(found);
            } else if (call.name === 'read_page') {
              if (typeof a.url !== 'string' || !a.url.trim()) throw new Error('url is required');
              const hit = (navIndex || []).find((l) => pageKey(l.href) === pageKey(a.url));
              run.steps.push(`Reading ${hit ? hit.label : 'page'}…`); update();
              const page = await readPageTool(a.url);
              seenUrls.add(pageKey(page.url));
              page.links.forEach((l) => seenUrls.add(pageKey(l.href)));
              content = JSON.stringify(page);
            } else throw new Error('Unknown tool ' + call.name);
          } catch (e) { content = String(e.message || e); isError = true; }
          results.push({ id: call.id, name: call.name, content, isError });
        }
        messages.push({ role: 'tool', results });
        if (!alive()) return;
      }
      if (!run.text && !run.error) run.error = 'I could not finish looking that up. Try rephrasing.';
    } catch (e) {
      run.error = 'Something went wrong while asking AI.';
    }
    run.done = true;
    update();
  }

  function openPalette() {
    let p = document.getElementById('gccx-palette');
    if (!p) {
      p = document.createElement('div');
      p.id = 'gccx-palette';
      p.innerHTML = `<div class="x-box" role="dialog" aria-label="Search myGCC"><input type="text" aria-label="Search myGCC"><div class="x-answer" aria-live="polite" hidden></div><ul role="listbox"></ul><div class="x-hint"></div></div>`;
      document.body.appendChild(p);
      p.addEventListener('mousedown', (e) => { if (e.target === p) closePalette(); });
      const input = p.querySelector('input');
      const hint = p.querySelector('.x-hint');
      const ansBox = p.querySelector('.x-answer');
      const list = p.querySelector('ul[role=listbox]');
      let active = 0, results = [], aiReady = false, drawSeq = 0, askTimer = 0;
      const startAsk = (raw) => {
        if (!aiReady || !raw) return;
        clearTimeout(askTimer);
        const run = askRun = { id: ++askSeq, q: raw, steps: [], text: '', links: [], error: '', done: false };
        draw();
        runAsk(run);
      };
      const cancelAsk = () => { clearTimeout(askTimer); askSeq++; askRun = null; };
      p._hint = () => {
        hint.textContent = (idxState.running ? `Indexing myGCC… (${idxState.done} of ${idxState.total}) · ` : '') + '↑ ↓ to move · Enter to open · Esc to close' + (aiReady ? ' · Tab to ask AI' : '');
        input.placeholder = aiReady ? 'Search myGCC or ask a question' : 'Search myGCC';
      };
      const draw = async () => {
        const my = ++drawSeq;
        const raw = input.value.trim(), q = raw.toLowerCase();
        await buildIndex();
        if (my !== drawSeq) return;
        const toks = tokenize(q);
        const run = askRun && askRun.q === raw ? askRun : null;
        const rows = [];
        if (run && run.done && run.links.length) run.links.forEach((l) => rows.push({ label: l.title, href: l.href, group: '' }));
        else if (aiReady && wordCount(raw) >= 3 && (!run || run.error)) rows.push({ ask: true, label: `Ask AI: “${raw}”`, href: '#', group: 'Tab' });
        if (q) searchEntries(q, 20).forEach(({ it }) => rows.push({ ...it, snip: snippetHTML(it.text, toks) }));
        else entries().slice(0, 40).forEach((it) => rows.push(it));
        if (q) rows.push({ label: `Search all of myGCC for “${raw}”`, href: '#', group: '', siteSearch: raw });
        results = rows;
        active = Math.min(active, Math.max(0, results.length - 1));
        if (run) {
          const steps = run.steps.slice(-3);
          ansBox.innerHTML = run.error ? `<p class="x-err">${esc(run.error)}</p>`
            : run.done ? run.text.split('\n').map((l) => `<p>${esc(l)}</p>`).join('')
            : `<ul class="x-steps">${(steps.length ? steps : ['Thinking…']).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
        } else ansBox.innerHTML = '';
        ansBox.hidden = !run;
        const note = !aiReady && looksLikeQuestion(raw) ? `<li class="x-note">Add an AI key from the toolbar icon to ask questions</li>` : '';
        list.innerHTML = results.map((r, i) => `<li class="${i === active ? 'is-active' : ''}${r.ask ? ' x-ask' : ''}" role="option" data-i="${i}"><a href="${esc(r.href)}"><b class="x-t">${esc(r.label)}</b><span class="x-g">${esc(r.group || '')}</span>${r.snip ? `<em class="x-s">${r.snip}</em>` : ''}</a></li>`).join('') + note || `<li><a>Nothing matches</a></li>`;
        list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
      };
      input.addEventListener('input', () => {
        active = 0;
        cancelAsk();
        draw();
        const raw = input.value.trim();
        if (aiReady && wordCount(raw) >= 3 && looksLikeQuestion(raw)) askTimer = setTimeout(() => { if (input.value.trim() === raw) startAsk(raw); }, 900);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
        else if (e.key === 'Tab' && aiReady && input.value.trim()) { e.preventDefault(); startAsk(input.value.trim()); }
        else if (e.key === 'Enter' && results[active]) { go(results[active]); }
        else if (e.key === 'Escape') closePalette();
      });
      list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-i]');
        const r = li && results[+li.dataset.i];
        if (r && (r.siteSearch || r.ask)) { e.preventDefault(); go(r); }
      });
      const go = (r) => {
        if (r.ask) { startAsk(input.value.trim()); input.focus(); return; }
        if (!r.siteSearch) { location.href = r.href; return; }
        const box = document.getElementById('siteNavBar_searchBox_tbSearch');
        const btn = document.getElementById('siteNavBar_searchBox_lbSearch');
        if (box && btn) { box.value = r.siteSearch; closePalette(); btn.click(); }
      };
      p._draw = draw;
      p._cancel = cancelAsk;
      p._setReady = (v) => { aiReady = v; p._hint(); };
    }
    p.classList.add('is-open');
    const input = p.querySelector('input');
    input.value = '';
    p._cancel();
    p._hint();
    p._draw();
    askStatus().then((r) => { p._setReady(!!(r && r.ready)); p._draw(); });
    ensurePageIndex();
    setTimeout(() => input.focus(), 0);
  }
  function closePalette() {
    const p = document.getElementById('gccx-palette');
    if (!p) return;
    p._cancel();
    p.classList.remove('is-open');
  }

  document.addEventListener('keydown', (e) => {
    if (!settings.enabled) return;
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      openPalette();
    }
  }, true);

  function addSearchButton() {
    if (document.getElementById('gccx-search-btn') || !document.body.classList.contains('logged-in')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'gccx-search-btn';
    b.innerHTML = `Search myGCC<kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>`;
    b.addEventListener('click', openPalette);
    document.body.appendChild(b);
  }

  // ---------------- boot ----------------
  // Developer auto-reload heartbeat (does nothing in the Web Store build)
  function devPing() {
    try {
      chrome.runtime.sendMessage({ type: 'dev-ping' }, (r) => {
        if (chrome.runtime.lastError || !r || !r.dev) return;
        if (!window.__gccxDevPing) window.__gccxDevPing = setInterval(devPing, 20000);
      });
    } catch (e) { /* extension reloading */ }
  }

  function boot() {
    devPing();
    if (!settings.enabled) return;
    addSearchButton();
    scrapeCurrentPage();
    initDashboard(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function safeJSON(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
})();
