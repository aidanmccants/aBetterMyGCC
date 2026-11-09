// aBetterMyGCC loading feedback. myGCC pages are server-bound (often 2-3s), so the
// moment the user navigates we show a thin progress bar at the top and, if it takes
// longer than ~300ms, a neutral skeleton over the content area. The next page shows
// the same skeleton from document_start until our layout is ready, then fades it out.
// No network requests; overlays are pointer-events:none and always removed.
(function () {
  'use strict';
  if (window.__gccxLoading) return;
  window.__gccxLoading = true;
  const root = document.documentElement;
  let enabled = true;
  try { enabled = (JSON.parse(localStorage.getItem('gccx-settings')) || {}).enabled !== false; } catch (e) { /* default on */ }

  const KEY = 'gccx-nav'; // per-tab note from the page being left to the next page; not a GCCX.handoff (this file runs before lib.js) and it checks its own age
  const AREA = ['#portlets', '#mainLayout .main-content', '#portlet-grid', '#mainLayout'];
  let bar = null, skel = null, tick = 0, skelTimer = 0, giveUp = 0, p = 0, busyEl = null, active = false, attached = false;
  const isOn = () => root.classList.contains('gccx');
  const warn = (m) => { try { window.GCCX && window.GCCX.log('warn', 'content', '[loading] ' + m); } catch (e) { /* ignore */ } };

  function kindOf(url) {
    try {
      const u = new URL(url, location.href);
      if (/forum/i.test(u.searchParams.get('portlet') || '')) return (u.searchParams.get('screen') || '').toLowerCase().includes('post') ? 'thread' : 'list';
      if (/^\/ics\/?(default\.aspx)?$/i.test(u.pathname) || /\/ics\/?$/i.test(u.pathname)) return 'home';
      if (/^\/ics\/(home|students?)\/?(default\.aspx)?$/i.test(u.pathname)) return 'home';
    } catch (e) { /* generic */ }
    return 'generic';
  }

  function area() {
    for (const s of AREA) { const n = document.querySelector(s); if (n && n.getBoundingClientRect().width > 200) return n; }
    return null;
  }

  function makeBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'gccx-load-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Loading page');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    root.appendChild(bar);
    return bar;
  }
  function setP(v) {
    p = v;
    if (!bar) return;
    bar.style.transform = 'scaleX(' + v.toFixed(3) + ')';
    bar.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  }

  const row = '<div class="sk-row"><i class="sk"></i><i class="sk"></i><i class="sk"></i></div>';
  function skelHTML(kind) {
    const rows = (n) => '<div class="sk-list">' + row.repeat(n) + '</div>';
    if (kind === 'home') return '<i class="sk sk-h"></i><div class="sk-stats">' + '<i class="sk sk-card"></i>'.repeat(4) + '</div><div class="sk-cards"><i class="sk sk-card tall"></i><i class="sk sk-card tall"></i></div>';
    if (kind === 'list') return '<i class="sk sk-h"></i><i class="sk sk-filter"></i>' + rows(8);
    if (kind === 'thread') return '<i class="sk sk-h"></i><i class="sk sk-sub"></i><div class="sk-list" style="padding:16px">' + '<i class="sk sk-p" style="width:92%"></i><i class="sk sk-p" style="width:84%"></i><i class="sk sk-p" style="width:60%"></i>' + '</div><div style="height:12px"></div>' + rows(3);
    return '<i class="sk sk-h"></i><div class="sk-stats">' + '<i class="sk sk-card"></i>'.repeat(4) + '</div>' + rows(5);
  }
  function showSkel(kind, rect, instant) {
    if (skel) return;
    if (!rect) { const a = area(); if (!a) return; rect = rectOf(a); }
    skel = document.createElement('div');
    skel.id = 'gccx-skel';
    skel.setAttribute('aria-hidden', 'true');
    skel.innerHTML = skelHTML(kind);
    Object.assign(skel.style, { left: rect.left + 'px', width: rect.width + 'px', top: Math.max(0, rect.top - (instant ? 0 : scrollY)) + 'px', bottom: '0px' });
    root.appendChild(skel);
    if (instant) skel.classList.add('is-on');
    else requestAnimationFrame(() => skel && skel.classList.add('is-on'));
  }
  // document-relative rect (top includes scroll) so the next page can reuse it at scroll 0
  function rectOf(n) { const r = n.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top + scrollY) }; }

  function setBusy(on) {
    if (on) { busyEl = area(); if (busyEl) busyEl.setAttribute('aria-busy', 'true'); }
    else if (busyEl) { busyEl.removeAttribute('aria-busy'); busyEl = null; }
  }

  // ---- outgoing navigation ----
  function start(url) {
    if (active || !attached) return;
    active = true;
    makeBar();
    bar.classList.remove('is-done');
    setP(0.08);
    clearInterval(tick);
    tick = setInterval(() => setP(p + (0.9 - p) * (p < 0.3 ? 0.18 : 0.05)), 250);
    const kind = kindOf(url || location.href);
    skelTimer = setTimeout(() => showSkel(kind), 300);
    setBusy(true);
    const a = area();
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), kind, p, rect: a ? rectOf(a) : null })); } catch (e) { /* storage off */ }
    clearTimeout(giveUp);
    giveUp = setTimeout(reset, 15000);
  }
  function reset() {
    active = false;
    clearInterval(tick); clearTimeout(skelTimer); clearTimeout(giveUp);
    if (bar) { bar.remove(); bar = null; }
    if (skel) { skel.remove(); skel = null; }
    setBusy(false);
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  // keep the saved progress fresh so the next page continues from where the bar was
  function saveP() { try { const s = JSON.parse(sessionStorage.getItem(KEY)); if (s) { s.p = p; sessionStorage.setItem(KEY, JSON.stringify(s)); } } catch (e) { /* ignore */ } }

  function linkTarget(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download')) return null;
    const t = (a.getAttribute('target') || '').toLowerCase();
    if (t && t !== '_self' && t !== '_top' && t !== '_parent') return null;
    const raw = a.getAttribute('href').trim();
    if (!raw || raw[0] === '#' || /^(javascript|mailto|tel):/i.test(raw)) return null; // postback links are caught by beforeunload
    let u; try { u = new URL(a.href, location.href); } catch (err) { return null; }
    if (u.host !== location.host || !/^https?:$/.test(u.protocol)) return null;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return null; // same-page anchor
    return u.href;
  }
  // bubbling listener on window + setTimeout 0, so handlers that preventDefault have run
  const onClickWin = (e) => {
    const url = linkTarget(e);
    if (!url) return;
    setTimeout(() => { if (!e.defaultPrevented) start(url); }, 0);
  };
  const onSubmit = (e) => {
    const f = e.target;
    if (!f || (f.getAttribute('target') || '').toLowerCase() === '_blank') return;
    setTimeout(() => { if (!e.defaultPrevented) start(f.action || location.href); }, 0);
  };
  // fallback for __doPostBack (form.submit() skips the submit event), back/forward, typed URLs
  const onBeforeUnload = () => {
    setTimeout(() => { if (!active) start(location.href); }, 0); // after any leave-page prompt
    saveP();
  };
  const onPageShow = (e) => { if (e.persisted) reset(); };
  function attach() {
    if (attached) return;
    attached = true;
    window.addEventListener('click', onClickWin);
    window.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', saveP);
    window.addEventListener('pageshow', onPageShow);
  }
  function detach() {
    attached = false;
    window.removeEventListener('click', onClickWin);
    window.removeEventListener('submit', onSubmit);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', saveP);
    window.removeEventListener('pageshow', onPageShow);
  }

  // ---- incoming: continue the bar and show the skeleton until our layout is ready ----
  let cancelIncoming = () => {};
  function startIncoming() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    if (!(saved && Date.now() - saved.t < 15000)) return;
    const kind = kindOf(location.href);
    const timers = [];
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    let done = false, rafId = 0;
    const listeners = [];
    const listen = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); listeners.push([t, ev, fn, opts]); };
    makeBar(); setP(Math.max(saved.p || 0.5, 0.5));
    tick = setInterval(() => setP(p + (0.95 - p) * 0.08), 250);
    if (saved.rect && Date.now() - saved.t > 250) showSkel(kind, saved.rect, true);
    const finish = () => {
      if (done) return; done = true;
      if (active) return; // user already navigated again; start() owns the bar now
      clearInterval(tick);
      if (bar) { const b = bar; b.classList.add('is-done'); setP(1); setTimeout(() => b.remove(), 400); bar = null; }
      if (skel) { const s = skel; s.classList.remove('is-on'); setTimeout(() => s.remove(), 250); skel = null; }
    };
    const ready = () => {
      if (root.classList.contains('gccx-forums') && document.querySelector('.pt_ForumPortlet .forums-portlet')) return !!document.querySelector('.forums-portlet.gccx-fx-ready');
      if (kind === 'home' && root.classList.contains('gccx') && document.querySelector('#portlet-grid')) return !!document.getElementById('gccx-dash');
      return true;
    };
    const onDom = () => {
      const t0 = Date.now();
      const check = () => {
        if (done) return;
        if (ready() || Date.now() - t0 > 2000) rafId = requestAnimationFrame(finish);
        else later(check, 50);
      };
      rafId = requestAnimationFrame(check);
    };
    if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', onDom, { once: true });
    else onDom();
    later(finish, 8000); // absolute fail-safe
    listen(window, 'load', () => later(finish, 2000), { once: true });
    listen(window, 'error', () => later(finish, 2000), { once: true });
    cancelIncoming = () => {
      done = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafId);
      listeners.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o));
      clearInterval(tick);
      cancelIncoming = () => {};
    };
  }

  // The extension's live switch: undo everything (bar, skeleton, aria-busy, listeners,
  // timers) the moment `gccx` is removed, and re-arm when it comes back.
  function teardown() {
    try { detach(); cancelIncoming(); reset(); } catch (e) { warn('teardown failed: ' + (e.message || e)); }
  }
  let wasOn = isOn();
  // loading.js runs before content.js sets `gccx`, so the saved setting decides the early path.
  if (enabled || wasOn) { attach(); try { startIncoming(); } catch (e) { warn('incoming failed: ' + (e.message || e)); } }
  new MutationObserver(() => {
    const now = isOn();
    if (now === wasOn) return;
    wasOn = now;
    if (now) attach(); else teardown();
  }).observe(root, { attributes: true, attributeFilter: ['class'] });
})();
