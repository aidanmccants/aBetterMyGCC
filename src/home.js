// aBetterMyGCC Home: school content only. A banner pointing to My Info, a campus-events week
// calendar (Week / List), the announcements portlet right under it, and the remaining portlets
// below a heading. Nothing personal. Portal nodes are moved (never copied) and put back on teardown.
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
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function warn(message, data) {
    try { if (X.log) X.log('warn', 'content', `[home] ${message}`, data); } catch (e) { /* log unavailable */ }
    console.warn('[aBetterMyGCC] home:', message);
  }

  let gen = 0, ok = 0;
  const undos = [];
  const moves = [];
  function safe(name, run, undo) {
    try { run(); ok++; undos.push(undo); } catch (e) {
      warn(`${name} failed; reverted it`, { error: String(e && e.message || e) });
      try { undo(); } catch (e2) { warn(`${name} undo failed`, { error: String(e2) }); }
    }
  }
  function move(node, parent) {
    moves.push([node, node.parentNode, node.nextSibling]);
    parent.appendChild(node);
  }
  function undoMoves() {
    moves.splice(0).reverse().forEach(([n, parent, next]) => {
      if (parent && parent.isConnected) parent.insertBefore(n, next && next.parentNode === parent ? next : null);
    });
  }
  const remove = (id) => { const n = document.getElementById(id); if (n) n.remove(); };

  const kindOf = (portlet) => {
    const t = portlet.className + ' ' + ($('.portlet-header-bar h3', portlet)?.textContent || '');
    return /announcement/i.test(t) ? 'announcements' : /event|calendar/i.test(t) ? 'events' : '';
  };

  /* ---------- banner ---------- */
  function banner(grid) {
    const b = el('section', null);
    b.id = 'gccx-home-banner';
    b.setAttribute('aria-label', 'Dashboard moved');
    const text = el('div', 'gccx-hm-text');
    text.append(el('h2', null, 'Your dashboard has moved to My Info'),
      el('p', null, 'Today’s classes, chapel, dining, degree progress and more.'));
    const a = el('a', 'gccx-hm-btn', 'Go to My Info');
    a.href = '/ICS/My_Info/';
    b.append(text, a);
    grid.parentNode.insertBefore(b, grid);
  }

  // #gccx-home-main (banner's next sibling, right before #portlet-grid) holds the events card and the announcements.
  function mainWrap(grid) {
    let m = document.getElementById('gccx-home-main');
    if (!m) {
      m = el('div');
      m.id = 'gccx-home-main';
      grid.parentNode.insertBefore(m, grid);
    }
    return m;
  }

  /* ---------- campus events week ---------- */
  const KEY = 'gccx-home-week';
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  function weekCard(grid, eventsPortlet) {
    const wc = X.weekcal, feed = X.feed;
    if (!wc || !feed) { warn('GCCX.weekcal / GCCX.feed missing; skipping the events calendar'); throw new Error('weekcal missing'); }
    const myGen = gen;
    const now = new Date();
    let events = [];
    try { events = feed.parseEvents(document, now) || []; } catch (e) { warn('could not read events', { error: String(e) }); }
    let mode = 'week';
    try { mode = localStorage.getItem(KEY) === 'list' ? 'list' : 'week'; } catch (e) { /* storage unavailable */ }
    if (mode === 'list' && !eventsPortlet) mode = 'week';
    let offset = 0;

    const card = el('section', 'gccx-hm-card');
    card.id = 'gccx-home-week';
    const head = el('div', 'gccx-hm-head');
    const title = el('h3', null, 'Calendar');
    const range = el('span', 'gccx-hm-range');
    const tools = el('div', 'gccx-hm-tools');
    const nav = el('div', 'gccx-hm-nav');
    const prev = el('button', 'gccx-hm-btn2', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous week');
    const next = el('button', 'gccx-hm-btn2', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next week');
    const todayB = el('button', 'gccx-hm-btn2 gccx-hm-today', 'This week'); todayB.type = 'button';
    nav.append(prev, todayB, next);
    const seg = el('div', 'gccx-hm-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Events view');
    const bw = el('button', null, 'Week'), bl = el('button', null, 'List');
    [bw, bl].forEach((b) => { b.type = 'button'; });
    seg.append(bw);
    if (eventsPortlet) seg.append(bl);
    tools.append(nav, seg);
    head.append(title, range, tools);
    const weekBox = el('div', 'gccx-hm-weekbox');
    const listBox = el('div', 'gccx-hm-listbox');
    card.append(head, weekBox, listBox);
    mainWrap(grid).appendChild(card);
    if (eventsPortlet) move(eventsPortlet, listBox);

    function paint() {
      if (myGen !== gen) return;
      const weekOf = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * 7);
      const days = wc.weekDays(weekOf);
      range.textContent = `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], { month: 'short', day: 'numeric' })}`;
      weekBox.innerHTML = wc.render(events, { weekOf, today: now, days: 7, layout: 'board', label: 'Calendar for the week' });
      card.dataset.mode = mode;
      weekBox.hidden = mode !== 'week';
      listBox.hidden = mode !== 'list';
      nav.hidden = mode !== 'week';
      range.hidden = mode !== 'week';
      bw.setAttribute('aria-pressed', String(mode === 'week'));
      bl.setAttribute('aria-pressed', String(mode === 'list'));
      todayB.disabled = offset === 0;
    }
    prev.addEventListener('click', () => { offset--; paint(); });
    next.addEventListener('click', () => { offset++; paint(); });
    todayB.addEventListener('click', () => { offset = 0; paint(); });
    const setMode = (m) => { mode = m; try { localStorage.setItem(KEY, m); } catch (e) { /* storage unavailable */ } paint(); };
    bw.addEventListener('click', () => setMode('week'));
    bl.addEventListener('click', () => setMode('list'));
    paint();

    // The portal's own events list can fill in after the page loads: read it again once it settles.
    let feedEvents = [];
    const reread = () => {
      if (myGen !== gen) return;
      let fresh = [];
      try { fresh = feed.parseEvents(document, now) || []; } catch (e) { return; }
      if (fresh.length) { events = fresh.concat(feedEvents.filter((f) => !fresh.some((x) => x.date === f.date && x.start === f.start && x.title.toLowerCase() === f.title.toLowerCase()))); paint(); }
    };
    if (document.readyState !== 'complete') window.addEventListener('load', () => setTimeout(reread, 300), { once: true });
    setTimeout(reread, 2000);

    // Plus the portal's iCal calendar feeds (read with the student's sign-in), last week through five weeks out.
    if (feed.calendars) {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7 * 7);
      feed.calendars(document, from, to, events).then((extra) => {
        if (myGen !== gen || !extra.length) return;
        feedEvents = extra;
        events = events.concat(extra);
        paint();
      });
    }
  }

  /* ---------- build ---------- */
  function build() {
    gen++;
    const grid = $('#portlet-grid');
    if (!grid) { warn('#portlet-grid not found; portal layout may have changed'); return; }
    const portlets = $$('.portlet', grid);
    const ann = portlets.find((n) => kindOf(n) === 'announcements');
    const ev = portlets.find((n) => kindOf(n) === 'events');
    if (!ann) warn('announcements portlet not found');
    if (!ev) warn('events portlet not found; List view unavailable');
    root.classList.add('gccx-homepage');

    safe('banner', () => banner(grid), () => remove('gccx-home-banner'));
    if (ann) {
      safe('announcements', () => {
        const wrap = el('div', 'gccx-hm-ann');
        wrap.id = 'gccx-home-ann';
        mainWrap(grid).appendChild(wrap);
        move(ann, wrap);
      }, () => remove('gccx-home-ann'));
    }
    // announcements first, then the campus events calendar (user's order)
    safe('events week', () => weekCard(grid, ev), () => remove('gccx-home-week'));
    safe('more heading', () => {
      const left = $$('.portlet', grid).filter((n) => n !== ann && n !== ev);
      if (!left.length) return;
      const h = el('h3', null, 'Resources and more from myGCC');
      h.id = 'gccx-home-more';
      grid.parentNode.insertBefore(h, grid);
    }, () => remove('gccx-home-more'));
    if (!ok) root.classList.remove('gccx-homepage');
  }

  // Extension switched off: put moved portlets back first, then remove everything inserted.
  function teardown() {
    gen++;
    const steps = undos.splice(0).reverse();
    undoMoves();
    steps.forEach((u) => { try { u(); } catch (e) { warn('teardown step failed', { error: String(e) }); } });
    ['gccx-home-banner', 'gccx-home-week', 'gccx-home-ann', 'gccx-home-more', 'gccx-home-main'].forEach(remove);
    ok = 0;
    root.classList.remove('gccx-homepage');
  }

  const start = () => { if (X.onLook) X.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
