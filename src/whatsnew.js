// "What's new" after an update: a small pill at the top of myGCC opens a
// short list of what changed. Shown once per version; never on a fresh install
// (the welcome screen covers that). No network requests.
// Preview: add ?gccxWhatsNew=1 to any myGCC URL, or run gccxWhatsNew() in the console.
(() => {
  'use strict';

  // ---- Release notes: edit here. Key = manifest version. ----
  // `features` = new things and redesigns; `fixes` = bugs fixed. Either may be omitted.
  // Each item: { title, desc, href? }. href adds a "Take me there" link.
  // Keep it warm and brief: one sentence about how it feels, no jargon.
  const NOTES = {
    '1.1.0': {
      sub: 'A few things should feel a little easier this week.',
      features: [
        { title: 'Make myGCC feel like you', desc: 'Choose a design, or let the pixel-art autumn theme appear for the holiday season. Light and dark mode still work.' },
        { title: 'Another way to send feedback', desc: 'Tap Feedback, write a note, add a screenshot if you like, and send it straight to the developer on Telegram.' },
        { title: 'Campus updates at a glance', desc: 'Announcements and upcoming events are easier to scan, with readable titles and quieter links.' },
        { title: 'Calmer Forums', desc: 'Forums that feel calm, not cluttered: type to find the topic you want, spot what’s unread at a glance, and read posts without squinting.' },
        { title: 'Faster-feeling page changes', desc: 'Click and you instantly see your next page taking shape, so moving around myGCC feels quicker and never frozen.' },
        { title: 'Know what’s open', desc: 'See which buildings are open right now and grab a library study room, so you never walk across campus to a locked door.' },
      ],
      fixes: [
        { title: 'Lots of Bugs', desc: 'Spacing, Readability, Boring Stuff.' },
      ],
    },
  };
  const SECTIONS = [['features', 'New'], ['fixes', 'Fixed']];

  const KEY = 'whatsnewSeen';
  const PILL = 'gccx-wn-pill';
  const MODAL = 'gccx-wn';
  const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
  const version = () => (hasChrome() ? chrome.runtime.getManifest().version : Object.keys(NOTES).pop());

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k) n.append(k);
    return n;
  }

  let markedFor = null;
  function markSeen(v) {
    if (markedFor === v || !hasChrome()) return;
    markedFor = v;
    try { chrome.storage.local.set({ [KEY]: v }); } catch (_) { /* context gone */ }
  }

  function removePill() { document.getElementById(PILL)?.remove(); }

  function showPill(v, preview) {
    if (document.getElementById(PILL) || document.getElementById(MODAL) || !document.body) return;
    const open = el('button', { type: 'button', class: 'gx-wn-open', text: 'See new features' });
    const close = el('button', { type: 'button', class: 'gx-wn-x', 'aria-label': 'Dismiss' }, '×');
    const pill = el('div', { id: PILL, role: 'status' }, open, close);
    open.addEventListener('click', () => openModal(v, preview));
    close.addEventListener('click', () => { removePill(); if (!preview) markSeen(v); });
    document.body.append(pill);
  }

  function openModal(v, preview) {
    const notes = NOTES[v];
    if (!notes || document.getElementById(MODAL)) return;
    removePill();
    if (!preview) markSeen(v);
    const prevFocus = document.activeElement;

    const title = el('h2', { id: 'gccx-wn-title', tabindex: '-1', text: `What’s new in v${v}` });
    const x = el('button', { type: 'button', class: 'gx-wn-x', 'aria-label': 'Close' }, '×');
    const list = el('div', null, ...SECTIONS.filter(([k]) => notes[k] && notes[k].length).map(([k, label]) =>
      el('section', { class: 'gx-wn-sec' },
        el('h4', { class: 'gx-wn-label', text: label }),
        el('ul', { class: 'gx-wn-list' }, ...notes[k].map((it) => el('li', null,
          el('h3', { text: it.title }),
          el('p', { text: it.desc }),
          it.href ? el('a', { href: it.href, class: 'gx-wn-go', text: 'Take me there' }) : null))))));
    const done = el('button', { type: 'button', class: 'gx-wn-done', text: 'Got it' });
    const dialog = el('div', { class: 'gx-wn-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gccx-wn-title' },
      el('header', null, el('div', null, title, notes.sub ? el('p', { class: 'gx-wn-sub', text: notes.sub }) : null), x),
      list,
      el('footer', null, done));
    const root = el('div', { id: MODAL }, dialog);

    const shut = () => {
      root.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); return; }
      if (e.key !== 'Tab') return;
      const f = [...dialog.querySelectorAll('button, a[href]')];
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement;
      if (!dialog.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (a === first || a === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    x.addEventListener('click', shut);
    done.addEventListener('click', shut);
    root.addEventListener('mousedown', (e) => { if (e.target === root) shut(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(root);
    title.focus({ preventScroll: true });
  }

  function preview() {
    const v = NOTES[version()] ? version() : Object.keys(NOTES).pop();
    removePill();
    showPill(v, true);
  }
  window.gccxWhatsNew = preview;

  function init() {
    if (/[?&]gccxWhatsNew=1\b/.test(typeof GCCX !== 'undefined' ? GCCX.loc().search : location.search)) return preview();
    if (!hasChrome()) return;
    const v = version();
    chrome.storage.local.get([KEY, 'onboarding'], (r) => {
      if (!chrome.runtime?.id || r[KEY] === v) return;
      // Fresh install (welcome screen pending) or no notes: just record it.
      if (r.onboarding === 'pending' || !NOTES[v]) return markSeen(v);
      showPill(v, false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
