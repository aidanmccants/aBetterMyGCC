// aBetterMyGCC My Info: size the chapel frame to its content, fold the one-link cards
// (residence, vehicle, directories) into one card, and even out the gutters.
// Same safety model as academics.js: check first, run each step on its own, undo a step that fails.
(function () {
  'use strict';
  if (!/^\/ICS\/My_Info\/?(Default_Page\.jnz)?$/i.test(location.pathname)) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const root = document.documentElement;

  function warn(message, data) {
    try { if (window.GCCX && GCCX.log) GCCX.log('warn', 'content', `[my info] ${message}`, data); } catch (e) { /* log unavailable */ }
    console.warn('[aBetterMyGCC] my info:', message);
  }
  let ok = 0;
  const undos = [];
  function safe(name, run, undo) {
    try { run(); ok++; undos.push(undo); } catch (e) {
      warn(`${name} failed; reverted it`, { error: String(e && e.message || e) });
      try { undo(); } catch (e2) { warn(`${name} undo failed`, { error: String(e2) }); }
    }
  }

  /* ---------- custom.gcc.edu frames (chapel, contact info...): full width, height from the frame ---------- */
  const unfit = [];
  function fitFrames() {
    const frames = $$('#portlets iframe').filter((f) => /^https:\/\/custom\.gcc\.edu\/gcc_misc\//i.test(f.src || ''));
    if (!frames.length) { warn('no custom.gcc.edu frames found (chapel attendance expected)'); return; }
    frames.forEach((f) => unfit.push(GCCX.fitFrame(f)));
  }

  /* ---------- one-link cards -> one card with full-size section titles ---------- */
  const moves = [];
  const merged = [];
  function mergeLinkCards() {
    const cards = ['#pg6_ResidenceInfo', '#pg7_VehicleInfo', '#pg8_PDFReports']
      .map((s) => $(s))
      .filter((p) => p && $('.portlet-padding', p) && $('.portlet-header-bar h3', p));
    // Fall back by shape if ids moved: small link-only cards in the same column.
    if (cards.length < 2) { warn('residence/vehicle/directory cards not found by id', { found: cards.length }); return; }
    const host = cards[0];
    host.classList.add('gccx-info-merged');
    cards.forEach((p, i) => {
      const body = $('.portlet-padding', p);
      const sec = document.createElement('section');
      sec.className = 'gccx-info-part';
      const h = document.createElement('h3');
      h.className = 'gccx-info-head';
      h.textContent = txt($('.portlet-header-bar h3', p)).replace(/^My\s+/i, '');
      moves.push([body, body.parentNode, body.nextSibling]);
      sec.append(h, body);
      host.append(sec);
      merged.push(sec);
      if (i > 0) p.classList.add('gccx-info-hidden');
    });
  }
  function undoMerge() {
    moves.reverse().forEach(([n, parent, next]) => parent && parent.insertBefore(n, next && next.parentNode === parent ? next : null));
    merged.forEach((s) => s.remove());
    $$('.gccx-info-merged, .gccx-info-hidden').forEach((p) => p.classList.remove('gccx-info-merged', 'gccx-info-hidden'));
  }

  function build() {
    if (!$('#portlets .portlet-column')) { warn('#portlets columns not found; portal layout may have changed'); return; }
    root.classList.add('gccx-info');
    safe('frame sizing', fitFrames, () => unfit.splice(0).forEach((u) => u()));
    safe('merge link cards', mergeLinkCards, undoMerge);
    if (!ok) root.classList.remove('gccx-info');
  }

  // Extension switched off: undo every step in reverse so the portal is back without a reload.
  function teardown() {
    undos.splice(0).reverse().forEach((u) => { try { u(); } catch (e) { warn('teardown step failed', { error: String(e) }); } });
    moves.length = 0; merged.length = 0;
    ok = 0;
    root.classList.remove('gccx-info');
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
