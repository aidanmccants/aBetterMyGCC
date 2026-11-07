// aBetterMyGCC links: (1) external links open in a new tab, (2) hover prerender
// of same-origin /ICS/ pages through the Speculation Rules API.
(function () {
  'use strict';
  const root = document.documentElement;
  const active = () => root.classList.contains('gccx');

  function anchorOf(e) {
    const t = e.target;
    return t && t.closest ? t.closest('a[href]') : null;
  }

  function resolve(a) {
    const raw = (a.getAttribute('href') || '').trim();
    if (!raw || raw[0] === '#' || /^(javascript|mailto|tel|sms|blob|data):/i.test(raw)) return null;
    try { return new URL(raw, location.href); } catch (_) { return null; }
  }

  // ---------- 1. external links -> new tab ----------
  function onClick(e) {
    try {
      if (!active() || e.defaultPrevented) return;
      if (e.button > 1 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return; // native behavior
      const a = anchorOf(e);
      if (!a || a.target || a.hasAttribute('download')) return;
      const u = resolve(a);
      if (!u || !/^https?:$/.test(u.protocol) || u.origin === location.origin) return;
      if (!touched.has(a)) touched.set(a, { rel: a.getAttribute('rel') });
      a.target = '_blank';
      const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      a.setAttribute('rel', [...rel].join(' '));
    } catch (_) { /* never break the page */ }
  }
  const touched = new Map(); // anchor -> its original rel (it had no target, or we would not touch it)

  // ---------- 2. hover prerender ----------
  const MAX_ACTIVE = 2, INTENT_MS = 150, DISCARD_MS = 3000;
  const BAD_QUERY = /(logout|logoff|signout|sign-out|delete|drop|remove|cancel|register|withdraw|action=)/i;
  const BAD_PATH = /(logout|logoff|signout|\.(pdf|docx?|xlsx?|pptx?|zip|csv|png|jpe?g|gif|mp4)$)/i;
  const useSpec = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules'));
  const entries = new Map(); // url -> { el, timer }
  let intentTimer = null, intentUrl = null;

  function eligible(a) {
    if (!active() || a.target === '_blank' || a.hasAttribute('download')) return null;
    if (window.GCCX && window.GCCX.demo) return null; // demo pages have no real /ICS/ URLs to prerender
    const u = resolve(a);
    if (!u || u.origin !== location.origin || !/^\/ics\//i.test(u.pathname)) return null;
    if (BAD_QUERY.test(u.search) || BAD_PATH.test(u.pathname)) return null;
    if (u.href.split('#')[0] === location.href.split('#')[0]) return null;
    u.hash = '';
    return u.href;
  }

  const log = (msg, data) => { try { window.GCCX && window.GCCX.log('info', 'prerender', msg, data); } catch (_) {} };
  const short = (url) => url.replace(location.origin, '');
  let hoverLink = null; // the eligible link currently under the pointer / focus

  function drop(url, why) {
    const e = entries.get(url);
    if (!e) return;
    clearTimeout(e.timer);
    try { e.el.remove(); } catch (_) {}
    entries.delete(url);
    log(`Discarded ${short(url)} (${why})`);
  }

  // Hover-away discard. Re-checks right before removing: if the pointer is back on
  // that link (or a mouseout fired spuriously from DOM changes), keep the page.
  function scheduleDrop(url) {
    const cur = entries.get(url);
    if (!cur || cur.timer) return;
    cur.timer = setTimeout(() => {
      cur.timer = null;
      if (hoverLink && eligible(hoverLink) === url) { log(`Kept ${short(url)} (still hovered)`); return; }
      drop(url, 'hovered away for 3 s');
    }, DISCARD_MS);
  }

  function start(url) {
    const cur = entries.get(url);
    if (cur) { clearTimeout(cur.timer); cur.timer = null; return; }
    while (entries.size >= MAX_ACTIVE) {
      // evict the oldest page that isn't waiting to be clicked under the pointer
      const victim = [...entries.keys()].find((k) => k !== url) || entries.keys().next().value;
      drop(victim, `limit of ${MAX_ACTIVE} reached`);
    }
    log(`Prerendering ${short(url)}`);
    try {
      let el;
      if (useSpec) {
        el = document.createElement('script');
        el.type = 'speculationrules';
        el.textContent = JSON.stringify({ prerender: [{ source: 'list', urls: [url] }] });
      } else {
        el = document.createElement('link');
        el.rel = 'prefetch';
        el.href = url;
      }
      (document.head || root).appendChild(el);
      entries.set(url, { el, timer: null });
    } catch (_) { /* CSP or unsupported: ignore */ }
  }

  function intent(e) {
    const a = anchorOf(e);
    if (!a) return;
    const url = eligible(a);
    if (!url) return;
    hoverLink = a;
    const cur = entries.get(url);
    if (cur) { clearTimeout(cur.timer); cur.timer = null; return; }
    clearTimeout(intentTimer);
    intentUrl = url;
    intentTimer = setTimeout(() => { intentTimer = null; start(url); }, INTENT_MS);
  }

  function leave(e) {
    const a = anchorOf(e);
    if (!a) return;
    const to = e.relatedTarget;
    if (to && a.contains(to)) return; // moving within the same link
    if (e.type === 'mouseout' && a.matches(':hover')) return; // spurious: pointer is still on it
    if (hoverLink === a) hoverLink = null;
    const u = resolve(a);
    if (!u) return;
    u.hash = '';
    if (intentTimer && intentUrl === u.href) { clearTimeout(intentTimer); intentTimer = null; }
    scheduleDrop(u.href);
  }

  const LISTENERS = [['click', onClick], ['auxclick', onClick], ['mouseover', intent], ['mouseout', leave], ['focusin', intent], ['focusout', leave]];
  let attached = false;
  const warn = (m) => { try { window.GCCX && window.GCCX.log('warn', 'content', '[links] ' + m); } catch (_) {} };

  function apply() {
    if (attached) return;
    attached = true;
    LISTENERS.forEach(([t, fn]) => document.addEventListener(t, fn, true));
  }
  function teardown() {
    attached = false;
    LISTENERS.forEach(([t, fn]) => document.removeEventListener(t, fn, true));
    clearTimeout(intentTimer); intentTimer = null; intentUrl = null; hoverLink = null;
    [...entries.keys()].forEach((u) => { try { drop(u, 'extension switched off'); } catch (e) { warn('drop failed: ' + (e.message || e)); } });
    touched.forEach((orig, a) => {
      try {
        a.removeAttribute('target');
        if (orig.rel === null) a.removeAttribute('rel'); else a.setAttribute('rel', orig.rel);
      } catch (e) { warn('restore failed: ' + (e.message || e)); }
    });
    touched.clear();
  }
  if (window.GCCX && window.GCCX.onLook) window.GCCX.onLook(apply, teardown);
  else if (active()) apply();
})();
