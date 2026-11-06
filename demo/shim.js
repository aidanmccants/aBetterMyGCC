// aBetterMyGCC demo shim. Loaded first on the extension's own demo pages
// (demo/index.html, demo/chapel.html), before the real content scripts.
// - Keeps demo data in its own storage namespace ("demo:" keys), so it never
//   mixes with a real student's cache or plan. Settings and the AI key are shared.
// - Stands in for myGCC: fetches of /ICS/... pages, form posts and postback
//   links are answered by demo/server.js with sample pages. Nothing is ever
//   sent to my.gcc.edu, and registration is a no-op (dry run).
(function () {
  'use strict';
  if (!/-extension:$/.test(location.protocol)) return; // only ever on the extension's own pages

  // ---------- storage namespace ----------
  const NS = 'demo:';
  const SHARED = new Set(['settings', 'ai']);
  const area = chrome.storage.local;
  const raw = { get: area.get.bind(area), set: area.set.bind(area), remove: area.remove.bind(area) };
  const toNS = (k) => (SHARED.has(k) ? k : NS + k);
  const fromNS = (k) => (SHARED.has(k) ? k : k.startsWith(NS) ? k.slice(NS.length) : null);
  const unwrap = (o) => { const out = {}; for (const [k, v] of Object.entries(o || {})) { const n = fromNS(k); if (n) out[n] = v; } return out; };
  const promised = (fn, cb) => (typeof cb === 'function' ? fn().then(cb) : fn());
  area.get = function (keys, cb) {
    if (typeof keys === 'function') { cb = keys; keys = null; }
    return promised(() => {
      if (keys == null) return raw.get(null).then(unwrap);
      if (typeof keys === 'string') return raw.get(toNS(keys)).then(unwrap);
      if (Array.isArray(keys)) return raw.get(keys.map(toNS)).then(unwrap);
      const dflt = {}; for (const [k, v] of Object.entries(keys)) dflt[toNS(k)] = v;
      return raw.get(dflt).then(unwrap);
    }, cb);
  };
  area.set = function (items, cb) {
    const o = {}; for (const [k, v] of Object.entries(items || {})) o[toNS(k)] = v;
    return promised(() => raw.set(o), cb);
  };
  area.remove = function (keys, cb) {
    return promised(() => raw.remove([].concat(keys).map(toNS)), cb);
  };
  const onChanged = chrome.storage.onChanged;
  const rawAdd = onChanged.addListener.bind(onChanged);
  onChanged.addListener = function (fn) {
    rawAdd((changes, areaName) => {
      if (areaName && areaName !== 'local') return;
      const mine = unwrap(changes);
      if (Object.keys(mine).length) fn(mine, areaName);
    });
  };

  if (document.documentElement.hasAttribute('data-gccx-demo-frame')) return; // chapel frame: storage only

  const S = window.GCCX_DEMO_SERVER;
  const PAGE = chrome.runtime.getURL('demo/index.html');
  const params = new URLSearchParams(location.search);
  const virt = params.get('u') || '/ICS/';
  const virtURL = () => new URL(virt, location.origin);
  const isPortal = (u) => u.origin === location.origin && /^\/ICS(\/|$)/i.test(u.pathname);
  const isCollege = (u) => /(^|\.)gcc\.edu$/i.test(u.hostname);
  const demoHref = (u) => `${PAGE}?u=${encodeURIComponent(u.pathname + u.search)}`;

  // A posted form survives the navigation in sessionStorage (like a browser POST).
  let posted = null;
  if (params.get('post')) {
    try { posted = JSON.parse(sessionStorage.getItem('gccx-demo-post') || 'null'); } catch (e) { /* none */ }
    sessionStorage.removeItem('gccx-demo-post');
    if (posted && posted.u !== virt) posted = null;
  }

  function go(href, body) {
    let u;
    try { u = new URL(href, virtURL()); } catch (e) { return; }
    if (isPortal(u)) {
      if (body != null) {
        sessionStorage.setItem('gccx-demo-post', JSON.stringify({ u: u.pathname + u.search, body: String(body) }));
        location.href = demoHref(u) + '&post=1';
      } else location.href = demoHref(u);
      return;
    }
    if (isCollege(u)) return; // the demo never opens the real portal
    if (/^https?:$/.test(u.protocol)) { window.open(u.href, '_blank', 'noopener'); return; }
    location.href = u.href;
  }

  // read by src/lib.js (GCCX.demo / loc() / go())
  window.__gccxDemo = { url: virt, go };
  window.__gccxDryRun = true; // builder.js: never press myGCC's Add button

  // ---------- network ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    let u;
    try { u = new URL(typeof input === 'string' ? input : input.url, virtURL()); } catch (e) { return realFetch(input, init); }
    if (isCollege(u)) return new Response('Blocked in demo mode', { status: 403 });
    if (!isPortal(u)) return realFetch(input, init);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const body = init && init.body != null ? String(init.body) : '';
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 120)); // feel like a network
    return new Response(S.handle(method, u.pathname + u.search, body), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  // The dining card asks the background for the live menu; the demo uses a sample one.
  const rawSend = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function (msg, cb) {
    if (msg && msg.type === 'menu') {
      const r = S.menu(msg.hall);
      if (typeof cb === 'function') { setTimeout(() => cb(r), 80); return undefined; }
      return Promise.resolve(r);
    }
    return rawSend(msg, cb);
  };

  // ---------- postbacks and navigation ----------
  function serialize(form, submitter, extra) {
    const body = new URLSearchParams();
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
      if (el.disabled || ['submit', 'button', 'image', 'reset', 'file'].includes(el.type)) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      body.set(el.name, el.value || '');
    });
    if (submitter && submitter.name) body.set(submitter.name, submitter.value || '');
    Object.entries(extra || {}).forEach(([k, v]) => body.set(k, v));
    return body;
  }
  const formAction = (form) => (form && form.getAttribute('action')) || virt;

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    go(formAction(form), serialize(form, e.submitter, { __EVENTTARGET: '', __EVENTARGUMENT: '' }));
  }, true);

  function onClick(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    const tab = a.getAttribute('data-demo-tab');
    if (tab) { e.preventDefault(); showTab(a, tab); return; }
    const href = a.getAttribute('href') || '';
    const pb = a.getAttribute('data-demo-postback') || (/__doPostBack\('([^']+)'/.exec(href) || [])[1];
    if (pb) {
      e.preventDefault();
      const form = a.closest('form') || document.querySelector('form');
      go(formAction(form), serialize(form, null, { __EVENTTARGET: pb, __EVENTARGUMENT: '' }));
      return;
    }
    if (!href || href[0] === '#' || /^javascript:/i.test(href)) return;
    let u; try { u = new URL(href, virtURL()); } catch (_) { return; }
    if (isCollege(u)) { e.preventDefault(); return; }
    if (!isPortal(u)) return; // external links: links.js opens them in a new tab
    e.preventDefault();
    if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey) window.open(demoHref(u), '_blank');
    else go(u.href);
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);

  // JICS dropdowns that post back on change (term pickers)
  document.addEventListener('change', (e) => {
    const sel = e.target;
    if (!sel.matches || !sel.matches('select[data-autopostback]')) return;
    const form = sel.closest('form');
    go(formAction(form), serialize(form, null, { __EVENTTARGET: sel.name, __EVENTARGUMENT: '' }));
  }, true);

  function showTab(a, name) {
    const box = a.closest('.contentTabs');
    if (!box) return;
    box.querySelectorAll(':scope > ul > li').forEach((li) => li.classList.toggle('selected', li.contains(a)));
    box.querySelectorAll('[data-demo-panel]').forEach((p) => { p.hidden = p.getAttribute('data-demo-panel') !== name; });
  }

  // ---------- render the page ----------
  function banner() {
    const b = document.createElement('div');
    b.id = 'gccx-demo-banner';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', 'Demo mode');
    // every element carries a gccx- class so contrast.js leaves it alone in dark mode
    b.innerHTML = `<strong class="gccx-demo-title">Demo mode: sample data</strong>
      <span class="gccx-demo-text">A made-up student, courses and people. Nothing is sent to myGCC and nothing is registered. Unofficial; not affiliated with Grove City College.</span>
      <span class="gccx-demo-actions">
        <button type="button" class="gccx-demo-btn" data-demo="welcome">Welcome screen</button>
        <button type="button" class="gccx-demo-btn" data-demo="ai">Set up AI</button>
        <button type="button" class="gccx-demo-btn" data-demo="reset">Reset demo</button>
        <button type="button" class="gccx-demo-btn" data-demo="exit">Exit demo</button>
      </span>`;
    b.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-demo]') && e.target.closest('[data-demo]').dataset.demo;
      if (act === 'welcome') area.set({ onboarding: 'pending' });
      if (act === 'ai') chrome.runtime.openOptionsPage();
      if (act === 'reset') {
        const all = await raw.get(null);
        await raw.remove(Object.keys(all).filter((k) => k.startsWith(NS)));
        try { localStorage.removeItem('gccx-settings'); sessionStorage.clear(); } catch (_) { /* ignore */ }
        location.href = PAGE;
      }
      if (act === 'exit') chrome.tabs.getCurrent((t) => (t ? chrome.tabs.remove(t.id) : window.close()));
    });
    return b;
  }

  function render() {
    const html = S.handle(posted ? 'POST' : 'GET', virt, posted ? posted.body : '');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Extension pages forbid javascript: URLs (CSP), so on screen JICS postback
    // links become href="#" + data-demo-postback, handled by onClick above.
    // (Pages fetched by the scripts keep the JICS form; they are only parsed.)
    doc.querySelectorAll('a[href^="javascript:" i]').forEach((a) => {
      const m = /__doPostBack\('([^']+)'/.exec(a.getAttribute('href'));
      if (m) a.setAttribute('data-demo-postback', m[1]);
      a.setAttribute('href', '#');
    });
    doc.querySelectorAll('[onclick], [onchange]').forEach((el) => { el.removeAttribute('onclick'); el.removeAttribute('onchange'); });
    document.title = `${doc.title} · aBetterMyGCC demo`;
    document.body.className = doc.body.className;
    document.body.replaceChildren(banner(), ...[...doc.body.childNodes].map((n) => document.adoptNode(n)));
    document.documentElement.classList.add('gccx-demo');
    const bar = document.getElementById('gccx-demo-banner');
    new ResizeObserver(() => document.documentElement.style.setProperty('--gccx-demo-h', bar.offsetHeight + 'px')).observe(bar);
  }

  // Seed what a real student would already have: the welcome screen on first
  // visit, and next term's registered classes (normally recorded when they open Add/Drop).
  async function seed() {
    const o = await raw.get([NS + 'onboarding', NS + 'registered']);
    const out = {};
    if (o[NS + 'onboarding'] === undefined) out[NS + 'onboarding'] = 'pending';
    const n = S.nextRegistered();
    const key = `${S.USER}|${n.term}`;
    const X = window.GCCX;
    if (X && !(o[NS + 'registered'] && o[NS + 'registered'][key])) {
      const meetings = (s) => {
        const list = [], re = /\b([MTWRFSU]{1,7})\s+(\d{1,2}:\d{2}\s*[AP]?M?\s*-\s*\d{1,2}:\d{2}\s*[AP]?M?)/gi;
        let m; while ((m = re.exec(s))) { const d = X.parseDays(m[1]), r = X.parseRange(m[2]); if (d && r) list.push({ days: d, start: r.start, end: r.end }); }
        return list;
      };
      out[NS + 'registered'] = { ...(o[NS + 'registered'] || {}), [key]: { ts: Date.now(), courses: n.courses.map((c) => ({ ...c, meetings: meetings(c.schedule) })) } };
    }
    if (Object.keys(out).length) await raw.set(out);
  }

  function boot() { render(); seed(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
