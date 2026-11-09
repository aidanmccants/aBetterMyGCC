// aBetterMyGCC term dropdowns.
// myGCC lists terms newest-first with no sense of "now". This reorders every
// term <select> to: current term, then future terms (soonest first), then a
// divider and past terms (most recent first). Each option is colored by
// season so you can tell them apart at a glance.
// Only the order and color change. Option values, and so what myGCC
// receives, stay exactly the same.
(function () {
  'use strict';

  // myGCC option values look like "2026;30": academic year ; session code.
  const SESSION = { 10: 'fall', 15: 'winter', 20: 'winter', 30: 'spring', 40: 'summer', 50: 'summer', 55: 'summer' };
  // Rough start dates (month index, day) for each session within its academic year
  const START = { 10: [7, 15, 0], 15: [11, 20, 0], 20: [11, 20, 0], 30: [0, 8, 1], 40: [4, 8, 1], 50: [5, 1, 1], 55: [6, 1, 1] };

  function info(opt) {
    const label = (opt.dataset && opt.dataset.gccxLabel) || (opt.label != null && !opt.tagName ? String(opt.label) : opt.textContent.trim());
    const m = /^(\d{4});(\d{2})$/.exec(opt.value);
    let year, code;
    if (m) { year = +m[1]; code = +m[2]; }
    else {
      // fall back to the label: "Spring Semester 2027"
      const y = /(\d{4})/.exec(label);
      if (!y) return null;
      const s = /fall/i.test(label) ? 10 : /winter/i.test(label) ? 15 : /spring/i.test(label) ? 30 : /may/i.test(label) ? 40 : /early summer/i.test(label) ? 50 : /summer/i.test(label) ? 55 : null;
      if (s == null) return null;
      code = s;
      year = +y[1] - (s >= 30 ? 1 : 0); // spring/summer belong to the academic year that began the fall before
    }
    const season = /fall/i.test(label) ? 'fall' : /winter/i.test(label) ? 'winter' : /spring/i.test(label) ? 'spring' : /summer|may/i.test(label) ? 'summer' : SESSION[code];
    const [mo, d, plus] = START[code] || [0, 1, 0];
    return { label, season, sort: year * 100 + code, start: new Date(year + plus, mo, d) };
  }

  function looksLikeTerms(sel) {
    const opts = [...sel.options];
    return opts.length >= 3 && opts.filter((o) => /(semester|term|summer|winter|spring|fall)/i.test(o.textContent) && /\d{4}/.test(o.textContent)).length >= opts.length - 1;
  }

  const arranged = new Map(); // select -> what is needed to undo it
  let obs = null, domHandler = null, live = false;
  const warn = (m) => { try { window.GCCX && window.GCCX.log('warn', 'content', '[terms] ' + m); } catch (e) { /* ignore */ } };

  function arrange(sel) {
    if (sel.dataset.gccxTerms) return;
    if (!looksLikeTerms(sel)) return;
    const now = new Date();
    const items = [...sel.options].map((o) => ({ o, t: info(o) }));
    if (items.some((x) => !x.t)) return; // something we don't understand; leave it alone
    sel.dataset.gccxTerms = '1';
    const origOpts = [...sel.options];
    const origText = origOpts.map((o) => o.textContent);
    const selectedValue = sel.value;
    items.sort((a, b) => a.t.sort - b.t.sort);
    // current = the latest term that has already started
    let cur = -1;
    items.forEach((x, i) => { if (x.t.start <= now) cur = i; });
    const current = cur >= 0 ? [items[cur]] : [];
    const future = items.slice(cur + 1);
    const past = items.slice(0, Math.max(cur, 0)).reverse();

    const frag = document.createDocumentFragment();
    const add = (x, tag) => {
      x.o.dataset.gccxLabel = x.t.label;
      x.o.textContent = x.t.label + (tag ? `  ·  ${tag}` : '');
      x.o.classList.add('gccx-term', `gccx-term-${x.t.season}`);
      frag.appendChild(x.o);
    };
    current.forEach((x) => add(x, 'current'));
    future.forEach((x) => add(x));
    if (past.length) {
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────  Past terms  ──────';
      sep.className = 'gccx-term-sep';
      sep.value = '';
      frag.appendChild(sep);
      past.forEach((x) => add(x));
    }
    sel.appendChild(frag);
    sel.value = selectedValue; // keep whatever myGCC had selected
    paint(sel);
    const onChange = () => paint(sel);
    sel.addEventListener('change', onChange);
    arranged.set(sel, { origOpts, origText, onChange });
  }
  // Put one select back exactly as myGCC rendered it
  function restore(sel, st) {
    const cur = sel.value;
    sel.removeEventListener('change', st.onChange);
    sel.querySelectorAll('option.gccx-term-sep').forEach((o) => o.remove());
    const frag = document.createDocumentFragment();
    st.origOpts.forEach((o, i) => {
      o.textContent = st.origText[i];
      o.classList.remove('gccx-term', 'gccx-term-fall', 'gccx-term-winter', 'gccx-term-spring', 'gccx-term-summer');
      if (!o.classList.length) o.removeAttribute('class');
      delete o.dataset.gccxLabel;
      frag.appendChild(o);
    });
    sel.appendChild(frag);
    sel.value = cur;
    sel.classList.remove('gccx-term-fall', 'gccx-term-winter', 'gccx-term-spring', 'gccx-term-summer', 'gccx-term-select');
    if (!sel.classList.length) sel.removeAttribute('class');
    delete sel.dataset.gccxTerms;
  }
  function teardown() {
    live = false;
    if (obs) { obs.disconnect(); obs = null; }
    if (domHandler) { document.removeEventListener('DOMContentLoaded', domHandler); domHandler = null; }
    arranged.forEach((st, sel) => { try { restore(sel, st); } catch (e) { warn('restore failed: ' + (e.message || e)); } });
    arranged.clear();
  }
  // color the closed select to match the chosen term
  function paint(sel) {
    const o = sel.options[sel.selectedIndex];
    sel.classList.remove('gccx-term-fall', 'gccx-term-winter', 'gccx-term-spring', 'gccx-term-summer');
    const season = o && [...o.classList].find((c) => /^gccx-term-(fall|winter|spring|summer)$/.test(c));
    if (season) sel.classList.add(season, 'gccx-term-select');
  }

  function run(rootEl) {
    (rootEl || document).querySelectorAll('select').forEach((sel) => {
      try { arrange(sel); } catch (e) { warn('arrange failed: ' + (e.message || e)); }
    });
  }
  function boot() {
    domHandler = null;
    if (!live || obs) return;
    run();
    obs = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && run(n))));
    obs.observe(document.body, { childList: true, subtree: true });
  }
  function apply() {
    teardown(); // idempotent: never double-apply
    live = true;
    if (document.readyState === 'loading') { domHandler = boot; document.addEventListener('DOMContentLoaded', domHandler); }
    else boot();
  }
  if (window.GCCX && window.GCCX.onLook) window.GCCX.onLook(apply, teardown);
  else if (document.documentElement.classList.contains('gccx')) apply();

  // Shared with builder.js: the term's name without our " · current" tag
  window.GCCX_termLabel = (opt) => (opt ? opt.dataset.gccxLabel || opt.textContent.trim() : '');
  // Shared with builder.js / academics.js (pure, no DOM change). Accept <option>s or { value, label }.
  window.GCCX_termInfo = (opt) => { try { return opt ? info(opt) : null; } catch (e) { return null; } };
  // The upcoming registration term: soonest "Semester" term starting after `now`;
  // else the current term (latest started). Returns the matching input item or null.
  window.GCCX_upcomingTerm = (opts, now = new Date()) => {
    const items = [...(opts || [])].filter((o) => o && o.value && !o.disabled).map((o) => ({ o, t: window.GCCX_termInfo(o) })).filter((x) => x.t);
    const next = items.filter((x) => /semester/i.test(x.t.label) && x.t.start > now).sort((a, b) => a.t.start - b.t.start)[0];
    if (next) return next.o;
    const started = items.filter((x) => x.t.start <= now).sort((a, b) => b.t.start - a.t.start)[0];
    return started ? started.o : null;
  };
})();
