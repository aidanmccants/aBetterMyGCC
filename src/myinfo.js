// aBetterMyGCC My Info, part 2: myGCC's own cards below the dashboard (content.js draws the dashboard).
// Built with the page kit (src/ui.js): a "My records" section, one tiles card for the one-link cards
// (residence, vehicle, directories) and "More from myGCC" for whatever is left. Portal cards are MOVED
// (never copied), so forms, frames and postbacks keep working; switching the extension off puts them back.
(function () {
  'use strict';
  if (!/^\/ICS\/My_Info\/?(Default_Page\.jnz)?$/i.test(location.pathname)) return;

  const ui = window.GCCX && GCCX.ui;
  if (!ui) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const c = ui.controller('my info');

  const titleOf = (p) => ui.txt($('.portlet-header-bar h3', p));
  // A portal card by id first, then by its pt_ class, then by header text: the pgN numbers shift between students.
  function find(grid, { id, cls, title }) {
    const byId = id && $('#' + id, grid);
    if (byId && byId.classList.contains('portlet')) return byId;
    const all = $$('.portlet', grid).filter((p) => !p.parentElement.closest('.portlet'));
    return (cls && all.find((p) => p.classList.contains(cls))) || (title && all.find((p) => title.test(titleOf(p)))) || null;
  }
  const isPlain = (a) => a && /^(https?:\/\/|\/)/i.test(a.getAttribute('href') || '');

  function build() {
    const grid = $('#portlet-grid');
    if (!grid || $('#gccx-page')) { if (!grid) c.warn('#portlet-grid not found; portal layout may have changed'); return; }
    const all = $$('.portlet', grid).filter((p) => !p.parentElement.closest('.portlet'));
    if (!all.length) { c.warn('no portal cards found'); return; }
    const used = new Set();
    const portlets = (...nodes) => nodes.filter(Boolean).map((n) => { used.add(n); return n; });

    const page = ui.page('me-records', 'Your records');
    c.safe('page frame', () => {
      const dash = $('#gccx-dash');
      if (dash && dash.parentNode) dash.parentNode.insertBefore(page, dash.nextSibling);
      else grid.parentNode.insertBefore(page, grid);
      root.classList.add('gccx-info');
    }, () => { page.remove(); root.classList.remove('gccx-info'); });
    if (!page.isConnected) return;

    // 1. My records
    c.safe('my records', () => {
      const chapel = find(grid, { id: 'pg2_Universal', title: /^chapel/i });
      const mine = portlets(chapel,
        find(grid, { id: 'pg9_Universal', title: /^contact information/i }),
        find(grid, { id: 'pg3_FinancialDocumentCenter', cls: 'pt_FinancialDocumentCenter', title: /financial document/i }),
        find(grid, { id: 'pg1_ResourcesPortlet', cls: 'pt_ResourcesPortlet', title: /^resources/i }));
      if (!chapel) c.warn('chapel attendance card not found');
      if (!mine.length) return;
      const sec = ui.section('My records');
      // two columns, so a folded card (chapel) does not leave a hole beside a tall one
      const colA = ui.col(), colB = ui.col();
      const body = ui.el('div', 'ux-portlets', [colA, colB]);
      sec.body.append(body);
      page.append(sec.root);
      mine.forEach((p) => c.move(p, p === chapel || /financial/i.test(p.className) ? colA : colB));
      if (chapel) c.collapse(chapel); // the Chapel tile above already states the number
      c.fitFrames(page);
    }, () => {});

    // 2. One-link cards: one tile per link, driving the portal's own link
    c.safe('link tiles', () => {
      const specs = [
        { card: find(grid, { id: 'pg6_ResidenceInfo', cls: 'pt_ResidenceInfo', title: /residence/i }), tiles: [{ title: 'Residence information', desc: 'Your room assignment and housing details.' }] },
        { card: find(grid, { id: 'pg7_VehicleInfo', cls: 'pt_VehicleInfo', title: /vehicle/i }), tiles: [{ title: 'Vehicle information', desc: 'Register or review the vehicle you park on campus.' }] },
        { card: find(grid, { id: 'pg8_PDFReports', cls: 'pt_PDFReports', title: /directories/i }), tiles: [
          { title: 'Student directory', desc: 'Look up a student.', match: /student/i },
          { title: 'Employee directory', desc: 'Look up faculty and staff.', match: /employee/i }] },
      ];
      const tiles = [], hide = [];
      specs.forEach((s) => {
        if (!s.card) { c.warn('one-link card not found', { first: s.tiles[0].title }); return; }
        const found = s.tiles.map((t) => {
          const links = $$('.portlet-padding a[href]', s.card);
          // the card's own link: a plain link becomes a link tile; a postback link is run through the portal's form on click
          const a = t.match ? links.find((l) => t.match.test(ui.txt(l))) : links[0];
          if (!a) return null;
          if (isPlain(a)) return { title: t.title, desc: t.desc, href: a.getAttribute('href') };
          return ui.isPostBack(a) ? { title: t.title, desc: t.desc, onClick: () => ui.postBack(a) } : null;
        });
        if (found.every(Boolean)) { tiles.push(...found); hide.push(s.card); }
        else c.warn('link not recognised, so its card stays as it is', { card: titleOf(s.card) });
      });
      if (!tiles.length) return;
      const sec = ui.section('Housing, vehicle and directories');
      const card = ui.card('Your information');
      card.body.append(ui.tiles(tiles));
      sec.body.append(card.root);
      page.append(sec.root);
      hide.forEach((p) => { used.add(p); c.hide(p); });
    }, () => {});

    // 3. Everything else, sorted by what it holds
    c.safe('more from myGCC', () => {
      const welcome = (p) => /pi_Welcome|pi_Free_form_Content\b/.test(p.className) && /welcome|instagram/i.test(titleOf(p));
      const left = all.filter((p) => !used.has(p) && !p.hidden && !welcome(p));
      const shown = [];
      left.forEach((p) => {
        const kind = ui.triage(p);
        if (kind === 'empty') { c.hide(p); return; }
        if (kind === 'decor') c.collapse(p);
        if (p.classList.contains('pt_ForumPortlet') || /^forums?$/i.test(titleOf(p))) c.collapse(p); // the dashboard lists recent posts
        shown.push(p);
      });
      if (!shown.length) return;
      const sec = ui.section('More from myGCC');
      const body = ui.el('div', 'ux-portlets');
      sec.body.append(body);
      page.append(sec.root);
      shown.forEach((p) => c.move(p, body));
    }, () => {});

    // the stock grid is now empty (or holds only hidden cards): take it out of the flow
    c.safe('empty grid', () => { if (!$$('.portlet', grid).some((p) => !p.classList.contains('ux-hidden') && !p.hidden)) c.hide(grid); }, () => {});
    if (!c.ok) root.classList.remove('gccx-info');
  }

  // Extension switched off: undo every step in reverse so the portal is back without a reload.
  function teardown() {
    c.teardown();
    $('#gccx-page')?.remove();
    root.classList.remove('gccx-info');
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
