// aBetterMyGCC search note: when a portal search fails (?tool=search), the portal's own error box
// says the search could not be executed. Put one muted line under it saying the problem is in myGCC,
// not in this extension. Same safety model as myinfo.js: on/off switch via GCCX.onLook, each step in
// safe(), undone on teardown.
(function () {
  'use strict';
  if (!/[?&]tool=search(&|$)/i.test(location.search)) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

  const NOTE_ID = 'gccx-search-note';
  const NOTE_TEXT = 'This seems to be an issue with myGCC, not A Better myGCC.';
  const ERROR_TEXT = /invalid syntax or structure and could not be executed/i;
  const WAIT_MS = 6000;

  function warn(message) {
    try { if (window.GCCX && GCCX.log) GCCX.log('warn', 'content', `[search note] ${message}`); } catch (e) { /* log unavailable */ }
    console.warn('[aBetterMyGCC] search note:', message);
  }
  const undos = [];
  function safe(name, run, undo) {
    try { run(); undos.push(undo); } catch (e) {
      warn(`${name} failed; reverted it`);
      try { undo(); } catch (e2) { warn(`${name} undo failed`); }
    }
  }

  // The portal's error box, found by its text inside the results area. Returns the box that holds
  // the text (the alert container), or null when the error is not there.
  function findErrorBox() {
    const area = $('#resultsbox');
    if (!area) return null;
    const hits = $$('*', area).filter((e) => ERROR_TEXT.test(txt(e)));
    const leaf = hits[hits.length - 1]; // document order: the innermost match comes last
    if (!leaf) return null;
    const box = leaf.closest('.alert-container') || leaf.parentElement;
    return box && box !== area && area.contains(box) ? box : null;
  }

  function insertNote(box) {
    if (document.getElementById(NOTE_ID)) return; // once only, never a duplicate
    const note = document.createElement('div');
    note.id = NOTE_ID;
    note.textContent = NOTE_TEXT;
    box.after(note);
  }
  function removeNote() {
    const note = document.getElementById(NOTE_ID);
    if (note) note.remove();
  }

  // Insert the note if the error box is on the page now. Returns true when the wait can stop.
  function tryInsert() {
    const box = findErrorBox();
    if (!box) return false;
    safe('note', () => insertNote(box), removeNote);
    return true;
  }

  // The error box may arrive after the first paint, so watch briefly. The observer is disconnected
  // as soon as the box is found, after WAIT_MS, and on teardown: nothing stays running.
  let obs = null;
  let timer = null;
  function stopWait() {
    if (obs) { obs.disconnect(); obs = null; }
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function waitForError() {
    stopWait();
    obs = new MutationObserver(() => { if (tryInsert()) stopWait(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(() => {
      stopWait();
      // Stay silent unless there is neither the error box nor any results: then the portal's markup has probably changed.
      if (!findErrorBox() && !txt($('#CP_V_ResultsForSearchLabel'))) warn('error box not found and no results shown; portal markup may have changed');
    }, WAIT_MS);
  }

  function build() {
    if (document.getElementById(NOTE_ID) || tryInsert()) return;
    safe('wait for error box', waitForError, stopWait);
  }

  // Extension switched off: stop watching and undo every step in reverse, without a reload.
  function teardown() {
    stopWait();
    undos.splice(0).reverse().forEach((u) => { try { u(); } catch (e) { warn('teardown step failed'); } });
  }

  const start = () => { if (window.GCCX && GCCX.onLook) GCCX.onLook(build, teardown); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
