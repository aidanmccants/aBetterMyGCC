// aBetterMyGCC for iOS: a small stand-in for the chrome.* extension APIs.
// The app injects this first into every context that runs extension code:
//   - "content": myGCC pages, in an isolated content world (like Chrome's
//     content-script world). The page itself cannot see it.
//   - "background": a hidden web view that runs src/background.js.
//   - "page": the extension's own pages (popup, options, demo, logs).
// Storage, messaging and network requests go to the native app through the
// "gccx" message handler; the native side keeps one shared storage file and
// routes runtime.sendMessage to the background context.
(function () {
  'use strict';
  const CONFIG = /*__GCCX_CONFIG__*/ null;
  if (!CONFIG || globalThis.__gccxShim) return;
  globalThis.__gccxShim = true;
  globalThis.__gccxIOS = true;

  const bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gccx;
  const call = (op, data) => {
    if (!bridge) return Promise.reject(new Error('aBetterMyGCC bridge unavailable'));
    return bridge.postMessage(JSON.stringify(Object.assign({ op }, data || {})))
      .then((r) => (r == null || r === '' ? undefined : JSON.parse(r)));
  };
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const later = (fn) => setTimeout(fn, 0);

  const event = () => {
    const ls = [];
    return {
      addListener(fn) { if (typeof fn === 'function' && !ls.includes(fn)) ls.push(fn); },
      removeListener(fn) { const i = ls.indexOf(fn); if (i >= 0) ls.splice(i, 1); },
      hasListener(fn) { return ls.includes(fn); },
      hasListeners() { return ls.length > 0; },
      _ls: ls,
    };
  };

  const runtime = {};
  // Support both callback and promise styles, like Chrome's MV3 APIs.
  const both = (p, cb) => {
    if (typeof cb !== 'function') return p;
    p.then((v) => { try { cb(v); } catch (e) { later(() => { throw e; }); } },
      (e) => {
        runtime.lastError = { message: String((e && e.message) || e) };
        try { cb(); } catch (err) { later(() => { throw err; }); } finally { runtime.lastError = undefined; }
      });
    return undefined;
  };

  // ---------- errors go to the app's log (visible in Xcode / Console.app) ----------
  const report = (level, parts) => {
    try {
      const message = parts.map((p) => (p && p.stack) || (typeof p === 'string' ? p : JSON.stringify(p))).join(' ').slice(0, 2000);
      if (/aBetterMyGCC: not for this page/.test(message)) return;
      if (level === 'error' && /^Script error\.? \(:0\)$/.test(message)) return; // masked cross-origin error
      call('console', { level, context: CONFIG.context, url: location.href.slice(0, 200), message }).catch(() => {});
    } catch (e) { /* never let logging break the page */ }
  };
  window.addEventListener('error', (e) => report('error', [e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')']));
  window.addEventListener('unhandledrejection', (e) => report('error', ['Unhandled rejection:', e.reason]));
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => { report(level, args); orig(...args); };
  }

  // ---------- storage ----------
  const changed = event();
  const local = {
    get(keys, cb) {
      if (typeof keys === 'function') { cb = keys; keys = null; }
      let names = null;
      let defaults = {};
      if (keys == null) names = null;
      else if (typeof keys === 'string') names = [keys];
      else if (Array.isArray(keys)) names = keys.map(String);
      else if (typeof keys === 'object') { defaults = keys; names = Object.keys(keys); }
      const p = call('storage.get', { keys: names }).then((found) => {
        const out = {};
        for (const k of Object.keys(defaults)) out[k] = clone(defaults[k]);
        return Object.assign(out, found || {});
      });
      return both(p, cb);
    },
    set(items, cb) {
      const p = call('storage.set', { items: clone(items || {}) || {} }).then(() => undefined);
      return both(p, cb);
    },
    remove(keys, cb) {
      const p = call('storage.remove', { keys: [].concat(keys == null ? [] : keys).map(String) }).then(() => undefined);
      return both(p, cb);
    },
    clear(cb) { return both(call('storage.clear').then(() => undefined), cb); },
    getBytesInUse(_keys, cb) { return both(Promise.resolve(0), typeof _keys === 'function' ? _keys : cb); },
    onChanged: event(),
  };
  // Called by the native app after any context changes storage.
  globalThis.__gccxStorageChanged = (json) => {
    const changes = typeof json === 'string' ? JSON.parse(json) : json;
    if (!changes || !Object.keys(changes).length) return;
    for (const fn of changed._ls.slice()) { try { fn(clone(changes), 'local'); } catch (e) { console.error(e); } }
    for (const fn of local.onChanged._ls.slice()) { try { fn(clone(changes)); } catch (e) { console.error(e); } }
  };

  // ---------- runtime ----------
  Object.assign(runtime, {
    id: 'abettermygcc-ios',
    lastError: undefined,
    getManifest: () => clone(CONFIG.manifest),
    getURL: (p) => CONFIG.base + String(p || '').replace(/^\//, ''),
    getPlatformInfo: (cb) => both(Promise.resolve({ os: 'ios', arch: 'arm' }), cb),
    sendMessage(...args) {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const msg = typeof args[0] === 'string' && args.length > 1 ? args[1] : args[0];
      const p = CONFIG.context === 'background'
        ? Promise.resolve(undefined)
        : call('runtime.sendMessage', { message: clone(msg) === undefined ? null : clone(msg) });
      if (!cb) return p;
      p.then((r) => {
        if (r === undefined) runtime.lastError = { message: 'The message port closed before a response was received.' };
        try { cb(r); } finally { runtime.lastError = undefined; }
      }, (e) => {
        runtime.lastError = { message: String((e && e.message) || e) };
        try { cb(); } finally { runtime.lastError = undefined; }
      });
      return undefined;
    },
    onMessage: event(),
    onConnect: event(),
    onInstalled: event(),
    onStartup: event(),
    onUpdateAvailable: event(),
    openOptionsPage(cb) { return both(call('openOptions').then(() => undefined), cb); },
    reload() { location.reload(); },
    connect() {
      return { name: '', postMessage() {}, disconnect() {}, onMessage: event(), onDisconnect: event() };
    },
  });

  const chromeApi = {
    runtime,
    storage: { local, onChanged: changed },
    tabs: {
      create(props, cb) { return both(call('openURL', { url: String((props && props.url) || '') }).then(() => ({ id: 1 })), cb); },
      query(_q, cb) { return both(Promise.resolve([]), cb); },
      reload(_id, _p, cb) { return both(Promise.resolve(), [_id, _p, cb].find((f) => typeof f === 'function')); },
      sendMessage() { return Promise.resolve(undefined); },
      onUpdated: event(),
      onRemoved: event(),
    },
    management: {
      getSelf(cb) { return both(Promise.resolve({ id: runtime.id, installType: 'normal', enabled: true, version: CONFIG.manifest.version }), cb); },
    },
    permissions: {
      request(_p, cb) { return both(Promise.resolve(true), cb); },
      contains(_p, cb) { return both(Promise.resolve(true), cb); },
      remove(_p, cb) { return both(Promise.resolve(true), cb); },
      getAll(cb) { return both(Promise.resolve({ permissions: ['storage'], origins: [] }), cb); },
      onAdded: event(),
      onRemoved: event(),
    },
    i18n: { getUILanguage: () => navigator.language || 'en-US', getMessage: () => '' },
  };
  globalThis.chrome = chromeApi;

  // ---------- extension pages and background: requests go through the app ----------
  // The background worker talks to Nutrislice and the AI providers. Routing
  // those through the app means no CORS, exactly like an extension worker.
  if (CONFIG.context !== 'content') {
    const pageFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;
    const toBytes = (b64) => {
      const bin = atob(b64 || '');
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    globalThis.fetch = async function (input, init) {
      init = init || {};
      const isReq = typeof Request !== 'undefined' && input instanceof Request;
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || String(input);
      let url;
      try { url = new URL(raw, location.href); } catch (e) { url = null; }
      if (!url || !/^(https?|gccx-extension):$/.test(url.protocol)) return pageFetch(input, init);
      let body = init.body;
      if (body == null && isReq && !/^(GET|HEAD)$/i.test(input.method)) body = await input.clone().text();
      if (body != null && typeof body !== 'string') {
        if (body instanceof URLSearchParams) body = body.toString();
        else if (pageFetch && url.protocol !== 'gccx-extension:') return pageFetch(input, init);
        else body = String(body);
      }
      const headers = {};
      new Headers(init.headers || (isReq ? input.headers : undefined) || {}).forEach((v, k) => { headers[k] = v; });
      const method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
      if (init.signal && init.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const r = await call('fetch', { url: url.href, method, headers, body: body == null ? null : body });
      if (!r || r.error) throw new TypeError('Failed to fetch' + (r && r.error ? ': ' + r.error : ''));
      const status = r.status >= 200 && r.status <= 599 ? r.status : 500;
      const nullBody = status === 204 || status === 205 || status === 304 || method === 'HEAD';
      const res = new Response(nullBody ? null : toBytes(r.body), { status, statusText: r.statusText || '', headers: r.headers || {} });
      try { Object.defineProperty(res, 'url', { value: url.href }); } catch (e) { /* read-only in some engines */ }
      return res;
    };
    window.close = () => { call('closePage').catch(() => {}); };
  }

  if (CONFIG.context === 'page') {
    // Extension pages were written for a desktop popup or tab: give them a phone
    // viewport, and let the 300px-wide toolbar popup fill the sheet.
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.querySelector('meta[name="viewport"]')) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        document.head.appendChild(meta);
      }
      if (/^\/popup\//.test(location.pathname)) {
        const style = document.createElement('style');
        style.textContent = 'body{width:auto!important;max-width:520px;margin:0 auto!important;padding:20px 22px!important;font-size:17px!important}' +
          '.row{min-height:44px}';
        document.head.appendChild(style);
      }
    }, { once: true });
  }

  if (CONFIG.context === 'background') {
    // background.js is a service worker in Chrome. Here the app loads its
    // importScripts() files as <script> tags first, so this is a no-op.
    globalThis.importScripts = () => {};
    globalThis.__gccxBg = {
      dispatch(msgJSON, senderJSON) {
        const msg = JSON.parse(msgJSON);
        const sender = JSON.parse(senderJSON || '{}');
        return new Promise((resolve) => {
          let done = false;
          let keep = false;
          const respond = (v) => {
            if (done) return;
            done = true;
            resolve(v === undefined ? undefined : JSON.stringify(v));
          };
          for (const fn of runtime.onMessage._ls.slice()) {
            let r;
            try { r = fn(msg, sender, respond); } catch (e) { console.error(e); continue; }
            if (r === true) keep = true;
          }
          if (!keep) respond(undefined);
          // Never leave a caller waiting forever (AI calls can be slow; allow 10 minutes).
          setTimeout(() => respond(undefined), 600000);
        });
      },
      fire(name, detailJSON) {
        const detail = detailJSON ? JSON.parse(detailJSON) : undefined;
        const ev = runtime[name];
        if (!ev) return;
        for (const fn of ev._ls.slice()) { try { fn(detail); } catch (e) { console.error(e); } }
      },
    };
  }

  if (CONFIG.context === 'content') {
    // Which content_scripts groups from manifest.json apply to this frame.
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const toRe = (pattern) => {
      if (pattern === '<all_urls>') return /^(https?|file|ftp):/;
      const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
      if (!m) return null;
      const scheme = m[1] === '*' ? 'https?' : esc(m[1]);
      const host = m[2] === '*' ? '[^/]*' : m[2].startsWith('*.') ? '(?:[^/]*\\.)?' + esc(m[2].slice(2)) : esc(m[2]);
      return new RegExp('^' + scheme + '://' + host + '(?::\\d+)?' + esc(m[3]).replace(/\*/g, '.*') + '$');
    };
    const href = location.href.split('#')[0];
    globalThis.__gccxRun = (CONFIG.groups || []).map((ms) => ms.some((p) => { const re = toRe(p); return !!re && re.test(href); }));

    // CSS from manifest.json, added the way Chrome adds content-script CSS:
    // before the page's own stylesheets, so the cascade matches the extension.
    globalThis.__gccxInjectCSS = (list) => {
      const els = list.map(({ name, css }) => {
        const s = document.createElement('style');
        s.setAttribute('data-gccx-css', name);
        s.textContent = css;
        return s;
      });
      const place = () => {
        const root = document.documentElement;
        const first = document.head || root.firstChild;
        for (const s of els) root.insertBefore(s, first && first.parentNode === root ? first : null);
      };
      if (document.documentElement) place();
      else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); place(); } }).observe(document, { childList: true });
    };

    if (window === window.top && globalThis.__gccxRun.some(Boolean)) {
      const mark = () => document.documentElement && document.documentElement.classList.add('gccx-ios');
      mark();
      document.addEventListener('DOMContentLoaded', () => {
        mark();
        // Make sure the page lays out for the phone's width.
        if (!document.querySelector('meta[name="viewport"]')) {
          const meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
          (document.head || document.documentElement).appendChild(meta);
        }
      }, { once: true });
    }
  }
})();
