// aBetterMyGCC Forums: restyles the JICS Forums portlet (main, topic, post, add/reply).
// Only adds classes, a breadcrumb and a filter box; every server link, postback and
// form stays in place. CSS hides the portlet body until we mark it ready (fallback reveal in CSS).
(function () {
  'use strict';
  const root = document.documentElement;

  function screenName() {
    try {
      const p = new URL(typeof GCCX !== 'undefined' ? GCCX.loc().href : location.href).searchParams;
      if (!/forum/i.test(p.get('portlet') || '')) return '';
      return (p.get('screen') || 'Main').toLowerCase();
    } catch (e) { return ''; }
  }

  const early = screenName();
  if (early) root.classList.add('gccx-forums', 'gccx-forums-' + early.replace(/[^a-z]/g, ''));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

  function crumbs(portlet, body) {
    if (body.querySelector('.gccx-fx-crumbs')) return;
    const home = portlet.querySelector('.portlet-header-bar h3 a') ||
      body.querySelector('.topic-navigation-main-screen-link');
    const items = [];
    items.push({ label: 'Forums', href: home && home.href });
    const cat = txt(body.querySelector('.category-label'));
    if (cat) items.push({ label: cat });
    const topic = txt(body.querySelector('.topic-link-title h3'));
    if (topic) items.push({ label: topic });
    const post = txt(body.querySelector('.post-title'));
    if (post) items.push({ label: post });
    if (body.querySelector('.add-post')) items.push({ label: txt(body.querySelector('.manage-title')) || 'New post' });
    if (items.length < 2) return;
    const nav = el('nav', 'gccx-fx-crumbs');
    nav.setAttribute('aria-label', 'Forum breadcrumb');
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      const n = it.href && !last ? el('a', '', it.label) : el('span', '', it.label);
      if (it.href && !last) n.href = it.href;
      if (last) n.setAttribute('aria-current', 'page');
      nav.appendChild(n);
      if (!last) nav.appendChild(el('span', 'gccx-fx-sep', '/'));
    });
    body.insertBefore(nav, body.firstChild);
  }

  function filterBox(body) {
    const grids = [...body.querySelectorAll('.forum-grid')];
    if (!grids.length || body.querySelector('.gccx-fx-filter')) return;
    const rowsOf = (g) => [...g.querySelectorAll(':scope > [role=row], :scope > [role=rowgroup] > [role=row]')]
      .filter((r) => !r.classList.contains('header-row') && !r.classList.contains('topic-view-header') && !r.closest('.topic-view-header'));
    const total = grids.reduce((n, g) => n + rowsOf(g).length, 0);
    if (total < 2) return;

    const wrap = el('div', 'gccx-fx-filter');
    const input = el('input');
    input.type = 'search';
    input.placeholder = early === 'main' ? 'Filter topics…' : 'Filter posts…';
    input.setAttribute('aria-label', input.placeholder);
    const count = el('span', 'gccx-fx-count');
    count.setAttribute('aria-live', 'polite');
    wrap.append(input, count);
    // put it right above the first grid's section
    const anchor = early === 'main' ? (body.querySelector('.main-content') || grids[0]) : grids[0];
    anchor.parentNode.insertBefore(wrap, anchor);

    const mainEmpty = early === 'main' ? el('p', 'gccx-fx-empty', 'Nothing matches that filter.') : null;
    if (mainEmpty) { mainEmpty.hidden = true; wrap.after(mainEmpty); }
    grids.forEach((g) => {
      if (mainEmpty) return;
      const e = el('p', 'gccx-fx-empty', 'Nothing matches that filter.');
      e.hidden = true;
      g.appendChild(e);
    });

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      grids.forEach((g) => {
        let n = 0;
        rowsOf(g).forEach((r) => {
          const hit = !q || r.textContent.toLowerCase().includes(q);
          r.classList.toggle('gccx-fx-hide', !hit);
          if (hit) n++;
        });
        shown += n;
        const empty = g.querySelector('.gccx-fx-empty');
        if (empty) empty.hidden = !(q && n === 0);
        // on the main screen, collapse whole forum sections with no matches
        if (early === 'main') {
          const off = !!q && n === 0;
          g.classList.toggle('gccx-fx-dim', off);
          let p = g.previousElementSibling;
          while (p && (p.tagName === 'SCRIPT' || p.matches('.default-grid, .forum-grid-description-row'))) {
            if (p.tagName !== 'SCRIPT') p.classList.toggle('gccx-fx-dim', off);
            if (p.matches('.default-grid')) break;
            p = p.previousElementSibling;
          }
        }
      });
      if (mainEmpty) mainEmpty.hidden = !(q && shown === 0);
      count.textContent = q ? shown + ' of ' + total : '';
    });
  }

  function markRows(body) {
    body.querySelectorAll('.forum-grid [role=row]').forEach((r) => {
      if (r.querySelector('a.unRead, .icon-unread-post, .glyphicons-folder-new')) r.classList.add('gccx-fx-unread');
    });
    // threads with no posts at all: show an empty state
    body.querySelectorAll('.forum-grid').forEach((g) => {
      const rows = g.querySelectorAll('[role=row]');
      const data = [...rows].filter((r) => !r.classList.contains('header-row') && !r.classList.contains('topic-view-header') && !r.closest('.topic-view-header'));
      if (!data.length && !g.querySelector('.gccx-fx-none')) {
        g.appendChild(el('p', 'gccx-fx-none', 'No posts here yet.'));
      }
    });
  }

  // Main screen: turn each table row into a list row (title + description | compact stats | latest).
  // Original nodes (title link, unread link, latest-post block) are moved, never recreated.
  const fmt = (n) => Number(n).toLocaleString('en-US');
  function rel(d) {
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 0) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
    const opt = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opt.year = 'numeric';
    return d.toLocaleDateString('en-US', opt);
  }
  function parseCount(s) {
    const m = (s || '').replace(/,/g, '').match(/(\d+)\s*(?:\((\d+)\))?/);
    return m ? { all: +m[1], mine: m[2] ? +m[2] : 0 } : null;
  }
  function cellByLabel(row, re) {
    return [...row.querySelectorAll('.forum-grid-column')].find((c) => {
      const l = c.querySelector('.forum-grid-header-label');
      return l && re.test(l.textContent);
    });
  }
  function rebuildMain(body) {
    body.querySelectorAll('.main-content .forum-grid').forEach((g) => {
      g.classList.add('gccx-fx-list');
      g.querySelectorAll('[role=row]:not(.header-row)').forEach((row) => {
        if (row.classList.contains('gccx-fx-rebuilt')) return;
        const topic = row.querySelector('.topic-link-container');
        if (!topic) return;
        const val = (c) => c && txt(c.querySelector('.mobile-column-value') || c);
        const unreadCell = cellByLabel(row, /unread/i);
        const posts = parseCount(val(cellByLabel(row, /posts/i)));
        const replies = parseCount(val(cellByLabel(row, /replies/i)));
        const latestCell = cellByLabel(row, /latest/i);
        const unread = parseCount(val(unreadCell));

        const line = el('div', 'gccx-fx-line');
        const left = el('div', 'gccx-fx-main');
        left.appendChild(topic);
        const stats = el('div', 'gccx-fx-stats');
        const bits = [];
        if (posts) bits.push(fmt(posts.all) + (posts.all === 1 ? ' post' : ' posts'));
        if (replies) bits.push(fmt(replies.all) + (replies.all === 1 ? ' reply' : ' replies'));
        const mine = (posts ? posts.mine : 0) + (replies ? replies.mine : 0);
        if (mine) bits.push(fmt(mine) + ' yours');
        stats.appendChild(el('span', 'gccx-fx-meta', bits.join(' · ')));
        if (unread && unread.all > 0) {
          const a = unreadCell.querySelector('a');
          const pill = a || el('span');
          pill.classList.add('gccx-fx-pill');
          pill.textContent = fmt(unread.all) + ' unread';
          stats.insertBefore(pill, stats.firstChild);
        } else {
          row.classList.remove('gccx-fx-unread');
        }
        const latest = el('div', 'gccx-fx-latest');
        const link = latestCell && latestCell.querySelector('.post-link a, .forum-post-info a');
        if (link) {
          const pa = latestCell.querySelector('.post-attribution');
          const lines = pa ? pa.innerText.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean) : [];
          const byLine = lines.find((l) => /^by\s/i.test(l));
          const by = byLine && byLine.replace(/^by\s+/i, '');
          const on = ((lines.find((l) => /^on\s/i.test(l)) || '').match(/(\d+\/\d+\/\d+)\s+at\s+([\d:]+\s*[AP]M)/i) || []);
          latest.append(el('span', 'gccx-fx-latest-label', 'Latest: '), link);
          if (by) latest.append(el('span', 'gccx-fx-dot', ' · '), el('span', 'gccx-fx-by', by));
          if (on[1]) {
            const d = new Date(on[1] + ' ' + on[2]);
            const t = el('time', 'gccx-fx-when', isNaN(d) ? on[1] : rel(d));
            t.title = on[1] + ' ' + on[2];
            latest.append(el('span', 'gccx-fx-dot', ' · '), t);
          }
        } else {
          latest.appendChild(el('span', 'gccx-fx-muted', 'No posts yet'));
        }
        line.append(left, stats, latest);
        row.appendChild(line);
        row.classList.add('gccx-fx-rebuilt');
      });
      const foot = g.querySelector('.footer-row');
      if (foot && !foot.classList.contains('gccx-fx-foot-wrap')) {
        // innerText lines: "Totals:", unread, posts(my), [sr text], replies(my), [sr text]
        const nums = foot.innerText.split(String.fromCharCode(10)).map((l) => l.trim()).filter((l) => /^[\d,]+(\(\d+\))?$/.test(l)).map(parseCount);
        const [u, p, r] = nums;
        const parts = [];
        if (u) parts.push(fmt(u.all) + ' unread');
        if (p) parts.push(fmt(p.all) + ' posts');
        if (r) parts.push(fmt(r.all) + ' replies');
        if (parts.length) {
          foot.classList.add('gccx-fx-foot-wrap');
          foot.appendChild(el('div', 'gccx-fx-foot', parts.join(' · ')));
        }
      }
    });
  }

  // "by X" / "on Wed 10/14/2026 at 1:18 PM" lines -> { by, date, raw }
  function attribution(scope) {
    const pa = scope && scope.querySelector('.post-attribution');
    const lines = pa ? pa.innerText.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean) : [];
    const byLine = lines.find((l) => /^by\s/i.test(l));
    const on = ((lines.find((l) => /^on\s/i.test(l)) || '').match(/(\d+\/\d+\/\d+)\s+at\s+([\d:]+\s*[AP]M)/i) || []);
    const d = on[1] ? new Date(on[1] + ' ' + on[2]) : null;
    return { by: byLine && byLine.replace(/^by\s+/i, ''), date: d && !isNaN(d) ? d : null, raw: on[1] ? on[1] + ' ' + on[2] : '' };
  }
  function metaLine(cls, prefixNodes, at) {
    const m = el('div', cls);
    prefixNodes.forEach((n, i) => { if (i) m.appendChild(el('span', 'gccx-fx-dot', ' · ')); m.appendChild(n); });
    if (at.by) { if (prefixNodes.length) m.appendChild(el('span', 'gccx-fx-dot', ' · ')); m.appendChild(el('span', 'gccx-fx-by', at.by)); }
    if (at.date) {
      const t = el('time', 'gccx-fx-when', rel(at.date));
      t.title = at.raw;
      m.append(el('span', 'gccx-fx-dot', ' · '), t);
    }
    return m;
  }

  // Thread list: same list design as the main screen.
  function rebuildTopic(body) {
    const g = body.querySelector('.forum-grid');
    if (!g || g.classList.contains('gccx-fx-list')) return;
    g.classList.add('gccx-fx-list');
    // header -> compact sort bar built from the original sort links (moved, so they keep working)
    const head = g.querySelector('.topic-view-header');
    if (head) {
      const links = [...head.querySelectorAll('a')];
      if (links.length) {
        const bar = el('div', 'gccx-fx-sort');
        bar.appendChild(el('span', 'gccx-fx-muted', 'Sort:'));
        links.forEach((a) => {
          a.textContent = a.textContent.replace(/\(My\)/, '').trim();
          bar.appendChild(a);
        });
        const active = head.querySelector('.glyphicons-chevron-up, .glyphicons-chevron-down, [class*="sort"]');
        if (active) {
          const near = active.closest('div, span');
          const a = near && near.querySelector('a');
          if (a) a.classList.add('gccx-fx-sort-on');
        }
        const filter = body.querySelector('.gccx-fx-filter');
        (filter || g).parentNode.insertBefore(bar, g);
      }
    }
    g.querySelectorAll(':scope > [role=row]').forEach((row) => {
      if (row.classList.contains('topic-view-header') || row.classList.contains('gccx-fx-rebuilt')) return;
      const cols = [...row.querySelectorAll('.forum-grid-column')];
      const first = cols[0];
      const link = first && first.querySelector('.post-link a');
      if (!link) return;
      const at = attribution(first);
      const unreadCell = cellByLabel(row, /unread/i);
      const unread = parseCount(txt(unreadCell && (unreadCell.querySelector('.mobile-column-value') || unreadCell)));
      const replies = parseCount(txt((cellByLabel(row, /replies/i) || {}).querySelector ? (cellByLabel(row, /replies/i).querySelector('.mobile-column-value') || cellByLabel(row, /replies/i)) : null));
      const latestCell = cellByLabel(row, /latest/i);

      const line = el('div', 'gccx-fx-line');
      const left = el('div', 'gccx-fx-main');
      const title = el('div', 'gccx-fx-title');
      title.appendChild(link);
      left.append(title, metaLine('gccx-fx-sub', [], at));
      const stats = el('div', 'gccx-fx-stats');
      const bits = [];
      if (replies) {
        bits.push(replies.all ? fmt(replies.all) + (replies.all === 1 ? ' reply' : ' replies') : 'No replies');
        if (replies.mine) bits.push(fmt(replies.mine) + ' yours');
      }
      stats.appendChild(el('span', 'gccx-fx-meta', bits.join(' · ')));
      if (unread && unread.all > 0) {
        const pill = (unreadCell.querySelector('a')) || el('span');
        pill.classList.add('gccx-fx-pill');
        pill.textContent = fmt(unread.all) + ' unread';
        stats.insertBefore(pill, stats.firstChild);
      }
      const latest = el('div', 'gccx-fx-latest');
      const lLink = replies && replies.all > 0 && latestCell && latestCell.querySelector('.post-link a, a');
      if (lLink) {
        const la = attribution(latestCell);
        latest.append(el('span', 'gccx-fx-latest-label', 'Latest: '), lLink);
        if (la.by) latest.append(el('span', 'gccx-fx-dot', ' · '), el('span', 'gccx-fx-by', la.by));
        if (la.date) { const t = el('time', 'gccx-fx-when', rel(la.date)); t.title = la.raw; latest.append(el('span', 'gccx-fx-dot', ' · '), t); }
        line.classList.add('gccx-fx-has-latest');
      }
      line.append(left, stats, latest);
      row.appendChild(line);
      row.classList.add('gccx-fx-rebuilt');
      row.classList.remove('gccx-fx-unread');
    });
    const foot = g.querySelector('.footer-row');
    if (foot && !foot.classList.contains('gccx-fx-foot-wrap')) {
      const nums = foot.innerText.split(String.fromCharCode(10)).map((l) => l.trim())
        .filter((l) => /^[\d,]+(\(\d+\))?$/.test(l)).map(parseCount);
      const [u, r] = nums;
      const parts = [];
      if (u) parts.push(fmt(u.all) + ' unread');
      if (r) parts.push(fmt(r.all) + ' replies' + (r.mine ? ' (' + fmt(r.mine) + ' yours)' : ''));
      foot.classList.add('gccx-fx-foot-wrap');
      const f = el('div', 'gccx-fx-foot', parts.length ? parts.join(' · ') : '');
      foot.appendChild(f);
    }
  }

  function run() {
    const portlet = document.querySelector('.pt_ForumPortlet');
    if (!portlet) { root.classList.remove('gccx-forums'); return; }
    const body = portlet.querySelector('.forums-portlet');
    if (!body) return;
    if (!early) root.classList.add('gccx-forums'); // forum portlet embedded on another page
    try {
      portlet.classList.add('gccx-fx');
      crumbs(portlet, body);
      // primary buttons are already AA via forums.css; opt them out of the dark-mode contrast pass
      portlet.querySelectorAll('.btn-primary').forEach((b) => {
        b.classList.add('gccx-fx-btn');
        b.style.removeProperty('color');
      });
      markRows(body);
      if (early === 'main') rebuildMain(body);
      if (early === 'topicview') rebuildTopic(body);
      filterBox(body);
    } catch (e) {
      console.warn('[aBetterMyGCC] forums', e);
    }
    body.classList.add('gccx-fx-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
