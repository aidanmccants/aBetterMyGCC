// aBetterMyGCC Home: school content only, in one kit page (#gccx-page): a hero saying what is on the
// campus calendar today, Announcements, the week calendar (Week / List), then myGCC's remaining cards.
// Nothing personal. Portal nodes are moved (never copied) through GCCX.ui.controller and put back on teardown.
(function () {
  'use strict';
  const X = window.GCCX;
  if (!X || !X.loc) return;
  const p = X.loc().pathname.toLowerCase().replace(/\/+$/, '');
  const q = X.loc().search || '';
  if (!['/ics', '/ics/portal_homepage.jnz', '/ics/default.aspx'].includes(p) || /portlet=|tool=/i.test(q)) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const ui = X.ui;
  const el = (tag, cls, text) => ui.el(tag, cls || null, text);
  const c = ui.controller('home');
  const warn = c.warn;
  let gen = 0;
  const remove = (id) => { const n = document.getElementById(id); if (n) n.remove(); };

  const kindOf = (portlet) => {
    const t = portlet.className + ' ' + ($('.portlet-header-bar h3', portlet)?.textContent || '');
    return /announcement/i.test(t) ? 'announcements' : /event|calendar/i.test(t) ? 'events' : '';
  };

  /* ---------- hero: what is on today ---------- */
  const clock = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const where = (e) => { const l = String(e.location || '').replace(/^at\s+/i, ''); return /^various locations?$/i.test(l) ? '' : l; };
  // One sentence about the campus calendar today, from events (portal list first, then the week from the API).
  function todayLead(events, now, loading) {
    const today = X.weekcal.ymd(now), nowMin = now.getHours() * 60 + now.getMinutes();
    const campus = events.filter((e) => e.kind !== 'class' && !e.cancelled);
    const byTime = (a, b) => (a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start);
    const todays = campus.filter((e) => e.date === today).sort(byTime);
    const upcoming = todays.filter((e) => e.allDay || e.start == null || e.start >= nowMin);
    const place = (e) => (where(e) ? [', ' + where(e)] : []);
    if (upcoming.length) {
      const timed = upcoming.filter((e) => !e.allDay && e.start != null);
      const nx = timed[0] || upcoming[0];
      const n = upcoming.length;
      return [`${n} more event${n === 1 ? '' : 's'} today. Next: `, { strong: nx.title }, nx.allDay || nx.start == null ? ' all day' : ' at ' + clock(nx.start), ...place(nx), '.'];
    }
    if (loading && !campus.length) return ['Checking the campus calendar…'];
    const lead = ['Nothing else on the campus calendar today.'];
    const later = campus.filter((e) => e.date > today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byTime(a, b)))[0];
    if (later) {
      const [y, m, d] = later.date.split('-').map(Number);
      const diff = Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      if (diff <= 6) {
        const day = diff === 1 ? 'tomorrow' : new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
        lead.push(' Next up: ', { strong: later.title }, ` ${day}` + (later.allDay || later.start == null ? '' : ' at ' + clock(later.start)), ...place(later), '.');
      }
    }
    return lead;
  }
  let heroEl = null; // the hero's lead paragraph, rewritten when the week arrives
  function hero(page, now) {
    const h = ui.hero({
      eyebrow: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
      title: 'On campus today',
      lead: ['Checking the campus calendar…'],
      actions: [ui.button('Your day', { href: '/ICS/My_Info/' })],
    });
    h.id = 'gccx-home-banner'; // loading.js waits for this id before it lifts the loading screen
    h.dataset.gccxState = 'loading';
    heroEl = { root: h, lead: h.querySelector('.ux-hero-lead') };
    page.append(h);
  }
  function heroUpdate(events, loading) {
    if (!heroEl) return;
    heroEl.lead.replaceChildren(...ui.sentence(todayLead(events, new Date(), loading)));
    heroEl.root.dataset.gccxState = loading ? 'loading' : 'ready';
  }

  /* ---------- calendar week ---------- */
  const KEY = 'gccx-home-week';
  const HIDE_KEY = 'gccx-home-hide';
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  function weekCard(body, eventsPortlet) {
    const wc = X.weekcal, feed = X.feed;
    if (!wc || !feed) { warn('GCCX.weekcal / GCCX.feed missing; skipping the events calendar'); throw new Error('weekcal missing'); }
    const myGen = gen;
    const now = new Date();
    // What the portal's own list shows (today, usually) until the full week arrives from its events API
    let listed = [];
    try { listed = feed.parseEvents(document, now) || []; } catch (e) { warn('could not read events', { error: String(e) }); }
    const weeks = new Map(); // monday ymd -> events from the API, or 'loading' / null (failed)
    let mode = 'week', hide = '';
    try { mode = localStorage.getItem(KEY) === 'list' ? 'list' : 'week'; const h = localStorage.getItem(HIDE_KEY); hide = h == null ? 'class' : h; } catch (e) { hide = 'class'; } // Home is for the school: classes start hidden
    if (mode === 'list' && !eventsPortlet) mode = 'week';
    let sel = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // the picked day

    const card = el('section', 'gccx-hm-card');
    card.id = 'gccx-home-week';
    const head = el('div', 'gccx-hm-head');
    const title = el('h3', null, 'Calendar');
    const range = el('span', 'gccx-hm-range');
    const tools = el('div', 'gccx-hm-tools');
    const chips = el('div', 'gccx-hm-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Show');
    const chip = (kind, label) => { const b = el('button', 'gccx-hm-chip is-' + kind, label); b.type = 'button'; b.dataset.kind = kind; return b; };
    const cEvent = chip('event', 'Campus events'), cClass = chip('class', 'Classes');
    chips.append(cEvent, cClass);
    const nav = el('div', 'gccx-hm-nav');
    const prev = el('button', 'gccx-hm-btn2', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous week');
    const next = el('button', 'gccx-hm-btn2', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next week');
    const todayB = el('button', 'gccx-hm-btn2 gccx-hm-today', 'Today'); todayB.type = 'button';
    nav.append(prev, todayB, next);
    const seg = el('div', 'gccx-hm-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Events view');
    const bw = el('button', null, 'Week'), bl = el('button', null, 'List');
    [bw, bl].forEach((b) => { b.type = 'button'; });
    seg.append(bw);
    if (eventsPortlet) seg.append(bl);
    tools.append(chips, nav, seg);
    head.append(title, range, tools);
    const weekBox = el('div', 'gccx-hm-weekbox');
    const listBox = el('div', 'gccx-hm-listbox');
    card.append(head, weekBox, listBox);
    body.appendChild(card);
    if (eventsPortlet) c.move(eventsPortlet, listBox);

    const monday = (d) => wc.weekDays(d)[0];
    function load(weekOf) {
      const m = monday(weekOf), key = wc.ymd(m);
      if (weeks.has(key) || !feed.calendarEvents) return;
      weeks.set(key, 'loading');
      const to = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7);
      feed.calendarEvents(document, m, to).then((list) => {
        if (myGen !== gen) return;
        weeks.set(key, list); // null: no ids on the page or the call failed; the listed events stay
        if (list == null && !warned) { warned = true; warn('calendar events API unavailable; showing the portal list only'); }
        paint();
      });
    }
    let warned = false;
    function paint() {
      if (myGen !== gen) return;
      const weekOf = sel;
      const days = wc.weekDays(weekOf);
      load(weekOf); // mark the week loading before drawing, so an unloaded week never reads as empty
      const got = weeks.get(wc.ymd(days[0]));
      const events = Array.isArray(got) ? got : listed;
      range.textContent = `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], { month: 'short', day: 'numeric' })}`;
      card.setAttribute('aria-busy', String(got === 'loading'));
      weekBox.innerHTML = wc.render(hide.includes('class') ? events.filter((e) => e.kind !== 'class') : events, { weekOf, today: now, days: 7, layout: 'board', maxPerDay: 6, label: 'Calendar for the week' });
      const root = weekBox.querySelector('.gccx-wk');
      if (root) root.dataset.hide = hide;
      const has = (k) => events.some((e) => (e.kind === 'class' ? 'class' : 'event') === k);
      [cEvent, cClass].forEach((b) => { b.setAttribute('aria-pressed', String(!hide.split(' ').includes(b.dataset.kind))); b.hidden = !has(b.dataset.kind); });
      chips.hidden = mode !== 'week' || !(has('class') && has('event'));
      card.dataset.mode = mode;
      weekBox.hidden = mode !== 'week';
      listBox.hidden = mode !== 'list';
      nav.hidden = mode !== 'week';
      range.hidden = mode !== 'week';
      bw.setAttribute('aria-pressed', String(mode === 'week'));
      bl.setAttribute('aria-pressed', String(mode === 'list'));
      todayB.disabled = wc.ymd(sel) === wc.ymd(now);
      load(weekOf);
      // the hero reads this week's campus events: the API list once it has arrived, else the portal's own list
      load(now);
      const cur = weeks.get(wc.ymd(monday(now)));
      heroUpdate(Array.isArray(cur) ? cur : listed, cur === 'loading' && !listed.length);
    }
    const go = (d) => { sel = d; paint(); };
    const shift = (n) => go(new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + n));
    prev.addEventListener('click', () => shift(-7));
    next.addEventListener('click', () => shift(7));
    todayB.addEventListener('click', () => go(new Date(now.getFullYear(), now.getMonth(), now.getDate())));
    const setMode = (m) => { mode = m; try { localStorage.setItem(KEY, m); } catch (e) { /* storage unavailable */ } paint(); };
    bw.addEventListener('click', () => setMode('week'));
    bl.addEventListener('click', () => setMode('list'));
    weekBox.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const [y, m, d] = pick.dataset.pick.split('-').map(Number);
        go(new Date(y, m - 1, d));
        weekBox.querySelector(`[data-pick="${pick.dataset.pick}"]`)?.focus(); // keep keyboard focus on the strip after the redraw
        return;
      }
      const b = e.target.closest('[data-more]');
      if (!b) return;
      const day = b.closest('.gccx-wk-day');
      const open = !day.classList.contains('is-expanded');
      day.classList.toggle('is-expanded', open);
      b.setAttribute('aria-expanded', String(open));
      if (!b.dataset.label) b.dataset.label = b.textContent; // "6 more"
      b.textContent = open ? 'Show fewer' : b.dataset.label;
    });
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.gccx-hm-chip');
      if (!b) return;
      const set = new Set(hide.split(' ').filter(Boolean));
      if (set.has(b.dataset.kind)) set.delete(b.dataset.kind); else set.add(b.dataset.kind);
      hide = [...set].join(' ');
      try { localStorage.setItem(HIDE_KEY, hide); } catch (err) { /* storage unavailable */ }
      paint();
    });
    paint();
  }

  /* ---------- build ---------- */
  const PAGE = 'gccx-page';
  function build() {
    gen++;
    const grid = $('#portlet-grid');
    if (!grid) { warn('#portlet-grid not found; portal layout may have changed'); return; }
    if (!X.ui || !X.weekcal) { warn('GCCX.ui or GCCX.weekcal missing; leaving Home alone'); return; }
    const portlets = $$('.portlet', grid);
    const ann = portlets.find((n) => kindOf(n) === 'announcements');
    const ev = portlets.find((n) => kindOf(n) === 'events');
    if (!ann) warn('announcements portlet not found');
    if (!ev) warn('events portlet not found; List view unavailable');
    root.classList.add('gccx-homepage');

    const now = new Date();
    const page = ui.page('home', 'Home');
    c.safe('page', () => grid.parentNode.insertBefore(page, grid), () => remove(PAGE));
    c.safe('hero', () => hero(page, now), () => { heroEl = null; });
    if (ann) {
      c.safe('announcements', () => {
        const s = ui.section('Announcements', { id: 'gccx-home-ann' });
        page.append(s.root);
        c.move(ann, s.body);
      });
    }
    c.safe('events week', () => {
      const s = ui.section('This week', { id: 'gccx-home-weeksec' });
      page.append(s.root);
      weekCard(s.body, ev);
    });
    // myGCC's other cards: empty ones stay hidden in place, picture-only ones fold, the rest show
    c.safe('more portlets', () => {
      const left = $$('.portlet', grid).filter((n) => n !== ann && n !== ev);
      const shown = [];
      left.forEach((n) => {
        const kind = ui.triage(n);
        if (kind === 'empty') { c.hide(n); return; }
        shown.push(n);
        if (kind === 'decor') c.collapse(n);
      });
      if (!shown.length) return;
      const s = ui.section('More from myGCC', { id: 'gccx-home-more' });
      const wrap = el('div', 'ux-portlets' + (shown.length === 1 ? ' is-single' : ''));
      s.body.append(wrap);
      page.append(s.root);
      shown.forEach((n) => c.move(n, wrap));
      c.fitFrames(wrap);
    });
    if (c.ok < 2) { root.classList.remove('gccx-homepage'); }
  }

  // Extension switched off: the controller puts moved portlets back first, then undoes the rest.
  function teardown() {
    gen++;
    c.teardown();
    remove(PAGE);
    heroEl = null;
    root.classList.remove('gccx-homepage');
  }

  const start = () => { if (X.onLook) X.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
