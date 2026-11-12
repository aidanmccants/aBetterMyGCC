// aBetterMyGCC page kit (GCCX.ui): the builders every redesigned page uses, so Home, My Info and
// Academics are made of the same parts. Classes are in src/ui.css; the rules are in docs/DESIGN.md.
// Everything here builds DOM nodes with textContent (never innerHTML), so portal and AI text is safe by construction.
(function () {
  'use strict';
  const X = window.GCCX;
  if (!X || X.ui) return;

  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

  // el('div', 'ux-card', 'text') or el('a', { class: 'ux-btn', href }, [child, 'text'])
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (typeof props === 'string') n.className = props;
    else if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
        else if (k === 'data') for (const [d, dv] of Object.entries(v)) n.dataset[d] = dv;
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach((k) => { if (k != null && k !== false) n.append(k); });
    return n;
  }

  // "Next: " + strong text. parts: strings (muted) and { strong: 'text' } / Node.
  function sentence(parts) {
    return (Array.isArray(parts) ? parts : [parts]).filter((p) => p != null && p !== '').map((p) =>
      typeof p === 'string' ? document.createTextNode(p) : p instanceof Node ? p : el('strong', null, p.strong));
  }

  /* ---------- parts ---------- */
  // The page frame: <section class="ux-page" id="gccx-page" data-ux-page="home">. One per page.
  function page(name, label) {
    return el('section', { class: 'ux-page', id: 'gccx-page', data: { uxPage: name }, 'aria-label': label });
  }
  // hero({ eyebrow, title, lead: [parts], actions: [nodes] })
  function hero(o) {
    const text = el('div', 'ux-hero-text', [
      o.eyebrow ? el('div', 'ux-hero-eyebrow', o.eyebrow) : null,
      el('h2', 'ux-hero-title', o.title),
      o.lead ? el('p', 'ux-hero-lead', sentence(o.lead)) : null,
    ]);
    return el('header', 'ux-hero', [text, o.actions && o.actions.length ? el('div', 'ux-hero-actions', o.actions) : null]);
  }
  // section('Today', { aside: node|string, id }) -> { root, body }. Put a .ux-grid or cards in body.
  function section(title, o = {}) {
    const body = el('div', o.bodyClass || null);
    const head = el('div', 'ux-section-head', [el('h2', 'ux-section-title', title),
      o.aside ? (o.aside instanceof Node ? o.aside : el('span', 'ux-section-aside', o.aside)) : null]);
    const root = el('section', { class: 'ux-section', id: o.id }, [head, body]);
    return { root, body, head };
  }
  const grid = (kind, kids) => el('div', 'ux-grid' + (kind ? ' is-' + kind : ''), kids); // kind: 'wide-narrow' | 'even' | 'thirds' | ''
  const col = (kids) => el('div', 'ux-col', kids);
  // card('Dining', { aside: node, sub: 'Lunch until 4:30', state: 'ready', accent }) -> { root, body, head }
  function card(title, o = {}) {
    const head = el('div', 'ux-card-head', [el('h3', 'ux-card-title', title), o.aside ? el('div', 'ux-card-aside', o.aside) : null]);
    const body = el('div', 'ux-card-body');
    const root = el('div', { class: 'ux-card' + (o.accent ? ' is-accent' : ''), data: o.state ? { gccxState: o.state } : null },
      [head, o.sub ? el('p', 'ux-card-sub', o.sub) : null, body]);
    return { root, body, head };
  }
  // stat({ label, value, small, note, href, tone: 'ok'|'warn'|'bad', meter: 0..100, text: true })
  function stat(o) {
    const value = el('div', 'ux-stat-value' + (o.text ? ' is-text' : ''), [o.value, o.small ? el('small', null, ' ' + o.small) : null]);
    return el(o.href ? 'a' : 'div', { class: 'ux-stat' + (o.tone ? ' is-' + o.tone : ''), href: o.href, data: o.state ? { gccxState: o.state } : null }, [
      el('div', 'ux-stat-label', o.label), value,
      o.meter != null ? el('div', 'ux-meter', el('i', { style: `width:${Math.max(0, Math.min(100, +o.meter || 0))}%` })) : null,
      o.note ? el('div', 'ux-stat-note', o.note) : null,
    ]);
  }
  // row({ lead, leadNote, title, href, sub, end, state: 'past'|'now'|'next' })
  function row(o) {
    const title = el(o.href ? 'a' : 'div', { class: 'ux-row-title', href: o.href, target: o.external ? '_blank' : null, rel: o.external ? 'noopener' : null }, o.title);
    return el('div', 'ux-row' + (o.state ? ' is-' + o.state : ''), [
      el('div', 'ux-row-lead', [o.lead || '', o.leadNote ? el('small', null, o.leadNote) : null]),
      el('div', 'ux-row-main', [title, o.sub ? el('div', 'ux-row-sub', o.sub) : null]),
      o.end ? el('div', 'ux-row-end', o.end) : null,
    ]);
  }
  const list = (rows) => el('div', 'ux-list', rows);
  const badge = (text, tone, plain) => el('span', 'ux-badge' + (tone ? ' is-' + tone : '') + (plain ? ' is-plain' : ''), text);
  const chips = (items) => el('div', 'ux-chips', items.map((i) => el('span', 'ux-chip' + (i.done ? ' is-done' : ''), i.text || i)));
  // button('Add or drop courses', { href, primary, small, onClick })
  function button(text, o = {}) {
    const cls = 'ux-btn' + (o.primary ? ' is-primary' : '') + (o.small ? ' is-small' : '');
    return o.href ? el('a', { class: cls, href: o.href, target: o.external ? '_blank' : null, rel: o.external ? 'noopener' : null }, text)
      : el('button', { class: cls, type: 'button', on: o.onClick ? { click: o.onClick } : null }, text);
  }
  const link = (text, href, o = {}) => el('a', { class: 'ux-link', href, target: o.external ? '_blank' : null, rel: o.external ? 'noopener' : null }, text);
  // seg([{ value, label }], current, onPick, 'Dining hall')
  function seg(options, current, onPick, label) {
    const root = el('div', { class: 'ux-seg', role: 'group', 'aria-label': label });
    const set = (v) => [...root.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    options.forEach((o) => root.append(el('button', { type: 'button', data: { value: o.value }, on: { click: () => { set(o.value); onPick(o.value); } } }, o.label)));
    set(current);
    return root;
  }
  const facts = (pairs) => el('dl', 'ux-facts', pairs.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
  const tile = (o) => el('a', { class: 'ux-tile', href: o.href, target: o.external ? '_blank' : null, rel: o.external ? 'noopener' : null },
    [el('span', 'ux-tile-title', o.title), o.desc ? el('span', 'ux-tile-desc', o.desc) : null]);
  const tiles = (items) => el('div', 'ux-tiles', items.map(tile));
  function more(summary, kids, open) {
    const d = el('details', { class: 'ux-more', open: !!open }, [el('summary', null, summary)]);
    d.append(el('div', null, kids));
    return d;
  }
  // state('loading' | 'empty' | 'error' | 'stale', 'Loading your schedule…')
  const state = (kind, text) => el('p', { class: 'ux-state', data: { kind }, role: kind === 'error' ? 'alert' : null }, text);
  const note = (text) => el('p', 'ux-note', text);

  /* ---------- working with myGCC's own cards ---------- */
  // What a portal card holds: 'empty' (nothing a student can read or use), 'decor' (only a picture),
  // or 'content'. Empty cards may be hidden; decor cards collapse; content is never hidden.
  function triage(portlet) {
    const body = portlet.querySelector('.portlet-padding, .pSection') || portlet;
    const frames = [...body.querySelectorAll('iframe, object, embed')];
    const controls = body.querySelector('input:not([type=hidden]), select, textarea, button, form [type=submit]');
    const links = [...body.querySelectorAll('a[href]')].filter((a) => txt(a) && !/^#?$/.test(a.getAttribute('href')) && !a.closest('.portlet-header-bar'));
    const words = txt(body).length;
    if (frames.length || controls || links.length || words >= 40) return 'content';
    return body.querySelector('img') ? 'decor' : 'empty';
  }

  // One per page script. Every change goes through it so the page can step aside cleanly:
  //   const c = GCCX.ui.controller('home');
  //   c.safe('hero', () => {...}, () => {...undo});   a step that throws is undone and logged; the rest still run
  //   c.move(portlet, newParent)                      moves a portal node and remembers where it was
  //   c.hide(node) / c.collapse(portlet)              both are undone by c.teardown()
  //   c.teardown()                                    extension switched off: portal exactly as it was
  function controller(name) {
    const undos = [], moves = [];
    let ok = 0;
    const warn = (message, data) => {
      try { if (X.log) X.log('warn', 'content', `[${name}] ${message}`, data); } catch (e) { /* log unavailable */ }
      console.warn(`[aBetterMyGCC] ${name}:`, message);
    };
    const c = {
      gen: 0,
      warn,
      get ok() { return ok; },
      safe(step, run, undo) {
        try { run(); ok++; if (undo) undos.push(undo); } catch (e) {
          warn(`${step} failed; reverted it`, { error: String(e && e.message || e), stack: e && e.stack });
          try { if (undo) undo(); } catch (e2) { warn(`${step} undo failed`, { error: String(e2) }); }
        }
      },
      move(node, parent, before) {
        moves.push([node, node.parentNode, node.nextSibling]);
        parent.insertBefore(node, before || null);
        return node;
      },
      hide(node) {
        if (!node || node.classList.contains('ux-hidden')) return;
        node.classList.add('ux-hidden');
        undos.push(() => node.classList.remove('ux-hidden'));
      },
      // Fold a portal card behind its header with a Show / Hide button. Nothing is removed.
      collapse(portlet, open) {
        const head = portlet && portlet.querySelector('.portlet-header-bar');
        if (!head || head.querySelector('.ux-toggle')) return;
        const b = button(open ? 'Hide' : 'Show', { small: true });
        b.classList.add('ux-toggle');
        const set = (isOpen) => { portlet.classList.toggle('ux-collapsed', !isOpen); b.textContent = isOpen ? 'Hide' : 'Show'; b.setAttribute('aria-expanded', String(isOpen)); };
        b.addEventListener('click', () => set(portlet.classList.contains('ux-collapsed')));
        head.append(b);
        set(!!open);
        undos.push(() => { b.remove(); portlet.classList.remove('ux-collapsed'); });
      },
      // custom.gcc.edu frames (chapel, contact info, self-service) are fixed-height: size them to their content
      fitFrames(scope) {
        [...(scope || document).querySelectorAll('iframe')].filter((f) => /^https:\/\/custom\.gcc\.edu\/gcc_misc\//i.test(f.src || ''))
          .forEach((f) => { const u = X.fitFrame(f); undos.push(u); });
      },
      teardown() {
        c.gen++;
        moves.splice(0).reverse().forEach(([n, parent, next]) => {
          if (parent && parent.isConnected) parent.insertBefore(n, next && next.parentNode === parent ? next : null);
        });
        undos.splice(0).reverse().forEach((u) => { try { u(); } catch (e) { warn('teardown step failed', { error: String(e) }); } });
        ok = 0;
      },
    };
    return c;
  }

  X.ui = { el, txt, sentence, page, hero, section, grid, col, card, stat, row, list, badge, chips, button, link, seg, facts, tile, tiles, more, state, note, triage, controller };
})();
