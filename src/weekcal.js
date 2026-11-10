// Week calendar: one week of classes and/or events as a time grid (wide) or an agenda list (narrow).
// Pure string building, no DOM access. Styles: src/weekcal.css. Used by Home and My Info.
(function (root) {
  'use strict';
  const X = root.GCCX || (root.GCCX = {});

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Monday..Sunday of the week containing weekOf, local midnight.
  function weekDays(weekOf) {
    const b = weekOf instanceof Date && !isNaN(weekOf) ? weekOf : new Date();
    const back = (b.getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => new Date(b.getFullYear(), b.getMonth(), b.getDate() - back + i));
  }

  const isMin = (n) => typeof n === 'number' && isFinite(n);
  function clock(m, withMer) {
    const h = Math.floor(m / 60) % 24, mi = m % 60;
    return ((h % 12) || 12) + (mi ? ':' + pad(mi) : '') + (withMer ? ' ' + (h >= 12 ? 'PM' : 'AM') : '');
  }
  function timeText(s, e) {
    if (!isMin(s)) return '';
    if (!isMin(e) || e <= s) return clock(s, true);
    const sameMer = (Math.floor(s / 60) % 24 >= 12) === (Math.floor(e / 60) % 24 >= 12);
    return clock(s, !sameMer) + '–' + clock(e, true);
  }

  // Lay out one day's timed items side by side: greedy column packing per overlapping cluster.
  function pack(list) {
    const sorted = list.slice().sort((a, b) => a.s - b.s || a.e - b.e);
    let cols = [], cluster = [], clusterEnd = -1;
    const close = () => { cluster.forEach((it) => { it.n = cols.length; }); cols = []; cluster = []; clusterEnd = -1; };
    sorted.forEach((it) => {
      if (cluster.length && it.s >= clusterEnd) close();
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e; it.c = c; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
    });
    close();
    return sorted;
  }

  function itemHtml(it, style, state) {
    const kind = (it.kind === 'class' ? 'is-class' : 'is-event') + (state ? ' ' + state : '');
    const t = timeText(it.s, it.e) || (it.s == null ? 'All day' : '');
    const inner = (t ? `<span class="gccx-wk-time">${esc(t)}${state === 'is-now' ? '<span class="gccx-wk-badge">Now</span>' : ''}</span>` : '') +
      `<strong class="gccx-wk-title">${esc(it.title)}</strong>` +
      (it.sub ? `<span class="gccx-wk-sub">${esc(it.sub)}</span>` : '');
    const tip = esc([t, it.title, it.sub].filter(Boolean).join(' · '));
    const href = it.href && X.safeUrl ? X.safeUrl(it.href, 'nav') : null;
    const st = style ? ` style="${style}"` : '';
    return href
      ? `<a class="gccx-wk-item ${kind}" href="${esc(href)}" title="${tip}"${st}>${inner}</a>`
      : `<div class="gccx-wk-item ${kind}" title="${tip}"${st}>${inner}</div>`;
  }

  function render(items, opts) {
    const o = opts || {};
    const today = o.today instanceof Date && !isNaN(o.today) ? o.today : new Date();
    const all = weekDays(o.weekOf || today);
    const keys = all.map(ymd);
    const byDay = keys.map(() => ({ allday: [], timed: [] }));
    (Array.isArray(items) ? items : []).forEach((raw) => {
      if (!raw || !raw.title) return;
      const i = keys.indexOf(String(raw.date));
      if (i < 0) return;
      const s = isMin(raw.start) ? Math.max(0, Math.min(1439, raw.start)) : null;
      let e = isMin(raw.end) ? Math.min(1440, raw.end) : null;
      const it = { title: String(raw.title), sub: raw.sub || raw.location, href: raw.href, kind: raw.kind, s, e };
      if (s == null) byDay[i].allday.push(it);
      else { if (e == null || e <= s) e = Math.min(1440, s + 60); it.e = e; byDay[i].timed.push(it); }
    });

    const count = (d) => d.allday.length + d.timed.length;
    const total = byDay.reduce((n, d) => n + count(d), 0);
    const shown = all.map((d, i) => i).filter((i) => o.days === 5 ? (i < 5 || count(byDay[i]) > 0) : true);

    const nowMin0 = today.getHours() * 60 + today.getMinutes();
    if (o.layout === 'board') return board(o, all, keys, byDay, shown, total, ymd(today), nowMin0);

    let h0 = 8, h1 = 18;
    byDay.forEach((d) => d.timed.forEach((it) => {
      h0 = Math.min(h0, Math.floor(it.s / 60));
      h1 = Math.max(h1, Math.ceil(it.e / 60));
    }));
    h1 = Math.min(24, Math.max(h1, h0 + 1));
    const span = (h1 - h0) * 60;

    const nowMin = today.getHours() * 60 + today.getMinutes();
    const todayKey = ymd(today);

    const cols = shown.map((di, ci) => {
      const d = all[di], key = keys[di], data = byDay[di];
      const isToday = key === todayKey;
      const timed = pack(data.timed).map((it) => {
        const top = (it.s - h0 * 60) / span * 100;
        const hgt = (it.e - it.s) / span * 100;
        const w = 100 / (it.n || 1);
        return itemHtml(it, `--t:${top.toFixed(3)}%;--h:${hgt.toFixed(3)}%;--l:${(it.c * w).toFixed(3)}%;--w:${w.toFixed(3)}%`);
      }).join('');
      const nowLine = isToday && nowMin >= h0 * 60 && nowMin < h1 * 60
        ? `<div class="gccx-wk-now" aria-hidden="true" style="--t:${((nowMin - h0 * 60) / span * 100).toFixed(3)}%"></div>` : '';
      const full = `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
      return `<div class="gccx-wk-day${isToday ? ' is-today' : ''}${count(data) ? '' : ' is-empty'}" data-date="${key}" style="--col:${ci + 2}">` +
        `<div class="gccx-wk-head" aria-label="${esc(full)}${isToday ? ' (today)' : ''}"><span class="gccx-wk-dow">${DOW[d.getDay()]}</span><span class="gccx-wk-dn">${d.getDate()}</span><span class="gccx-wk-mon">${MON[d.getMonth()]}</span></div>` +
        `<div class="gccx-wk-allday">${data.allday.map((it) => itemHtml(it)).join('')}</div>` +
        `<div class="gccx-wk-body">${timed}${nowLine}</div></div>`;
    }).join('');

    const hours = [];
    for (let h = h0; h < h1; h++) hours.push(`<span>${(h % 12) || 12} ${h >= 12 ? 'PM' : 'AM'}</span>`);

    return `<div class="gccx-wk${o.compact ? ' is-compact' : ''}" data-hide="" role="group" aria-label="${esc(o.label || 'Week calendar')}" style="--wk-n:${h1 - h0};--wk-days:${shown.length}">` +
      `<div class="gccx-wk-grid"><div class="gccx-wk-hours" aria-hidden="true">${hours.join('')}</div>${cols}</div>` +
      (total ? '' : '<p class="gccx-wk-empty">Nothing scheduled this week</p>') + '</div>';
  }

  // Board layout: one column per day with that day's items stacked as readable cards (all-day first,
  // then by start time). Suits sparse, mixed-length campus events better than an hour grid.
  function board(o, all, keys, byDay, shown, total, todayKey, nowMin) {
    const cols = shown.map((di) => {
      const d = all[di], key = keys[di], data = byDay[di];
      const isToday = key === todayKey, past = key < todayKey;
      const timed = data.timed.slice().sort((a, b) => a.s - b.s || a.e - b.e);
      const list = data.allday.map((it) => itemHtml(it, null))
        .concat(timed.map((it) => itemHtml(it, null, isToday ? (it.e <= nowMin ? 'is-past' : it.s <= nowMin ? 'is-now' : '') : '')));
      const full = `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
      return `<section class="gccx-wk-day${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}${list.length ? '' : ' is-empty'}" data-date="${key}" aria-label="${esc(full)}${isToday ? ' (today)' : ''}">` +
        `<div class="gccx-wk-head" aria-hidden="true"><span class="gccx-wk-dow">${isToday ? 'Today' : DOW[d.getDay()]}</span><span class="gccx-wk-dn">${d.getDate()}</span><span class="gccx-wk-mon">${MON[d.getMonth()]}</span></div>` +
        `<div class="gccx-wk-list">${list.join('') || '<p class="gccx-wk-none">No events</p>'}</div></section>`;
    }).join('');
    return `<div class="gccx-wk is-board${o.compact ? ' is-compact' : ''}" data-hide="" role="group" aria-label="${esc(o.label || 'Week calendar')}" style="--wk-days:${shown.length}">` +
      `<div class="gccx-wkb">${cols}</div>` +
      (total ? '' : '<p class="gccx-wk-empty">Nothing scheduled this week</p>') + '</div>';
  }

  X.weekcal = { weekDays, ymd, render };
})(typeof window !== 'undefined' ? window : globalThis);
