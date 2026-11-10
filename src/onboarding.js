(() => {
  'use strict';

  const ID = 'gccx-onboarding';
  const LOCK = 'gccx-onboarding-lock';
  const DEFAULTS = { enabled: true, theme: 'auto', designTheme: 'gcc', holidayThemes: true, dashboard: true, hidePromos: true, hideGpa: true, hall: 'hicks-cafe' };
  const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

  let settings = { ...DEFAULTS };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k) n.append(k);
    return n;
  }

  function saveSetting(patch) {
    settings = { ...settings, ...patch };
    if (!hasChrome()) return;
    try {
      chrome.storage.local.get('settings', ({ settings: cur }) => {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.set({ settings: { ...DEFAULTS, ...(cur || {}), ...patch } });
      });
    } catch (_) { /* extension reloaded */ }
  }

  function segmented(label, key, options) {
    const group = el('div', { class: 'gx-seg', role: 'group', 'aria-label': label });
    const btns = options.map(([value, text]) => {
      const b = el('button', { type: 'button', 'data-value': value, text });
      b.addEventListener('click', () => { saveSetting({ [key]: value }); sync(); });
      group.append(b);
      return b;
    });
    group._sync = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(settings[key] === b.dataset.value)));
    return group;
  }

  function toggle(id, key, text) {
    const input = el('input', { type: 'checkbox', id });
    input.addEventListener('change', () => saveSetting({ [key]: input.checked }));
    const row = el('label', { class: 'gx-toggle', for: id }, input, el('span', { text }));
    row._sync = () => { input.checked = !!settings[key]; };
    return row;
  }

  let controls = [];
  function sync() { controls.forEach((c) => c._sync()); }

  const FEATURES = () => [
    ['Your day on My Info', 'Classes with rooms and professors, chapel credits, account balance, degree progress, and what’s for dinner at Hicks and MAP. Home keeps campus news and events.'],
    ['Course planner on Add/Drop', 'Save sections, see conflicts on a week calendar, then register for everything at once. Export as text or CSV.'],
    ['Search', `Press ${isMac ? '⌘ K' : 'Ctrl K'} on any page to jump anywhere.`],
    ['Term dropdowns', 'They start at the current term and are color-coded by season.'],
    ['Dark mode', 'Keeps every page readable.'],
    ['Plan with AI (optional)', 'Bring your own key from Anthropic, OpenAI, xAI or Google. Use Set up AI below, or add it later.'],
  ];

  function build() {
    const title = el('h1', { id: 'gccx-onboarding-title', tabindex: '-1', text: 'Welcome to aBetterMyGCC' });
    const intro = el('p', { class: 'gx-intro', text: 'It makes myGCC cleaner and puts what students check most in one place.' });

    const list = el('ul', { class: 'gx-features' });
    for (const [h, p] of FEATURES()) {
      list.append(el('li', {}, el('h2', { text: h }), el('p', { text: p })));
    }

    const theme = segmented('Appearance', 'theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]);
    const hall = segmented('Default dining hall', 'hall', [['hicks-cafe', 'Hicks'], ['map-cafe', 'MAP']]);
    const dash = toggle('gccx-ob-dashboard', 'dashboard', 'Show my day on My Info');
    const promo = toggle('gccx-ob-promos', 'hidePromos', 'Hide promo banners');
    const gpa = toggle('gccx-ob-gpa', 'hideGpa', 'Hide my GPA on My Info (press and hold to show)');
    controls = [theme, hall, dash, promo, gpa];
    const aiBtn = el('button', { type: 'button', class: 'gx-ai', text: 'Set up AI' });
    aiBtn.addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'open-options' }); } catch (_) { /* reloaded */ } });

    const card = el('section', { class: 'gx-card', 'aria-label': 'Settings' },
      el('h2', { class: 'gx-card-title', text: 'Settings' }),
      el('div', { class: 'gx-field' }, el('span', { class: 'gx-label', text: 'Appearance' }), theme),
      dash,
      promo,
      gpa,
      el('div', { class: 'gx-field' }, el('span', { class: 'gx-label', text: 'Default dining hall' }), hall),
      el('div', { class: 'gx-field gx-ai-row' }, el('span', { class: 'gx-label', text: 'Plan with AI and Ask AI (optional)' }), aiBtn),
      el('p', { class: 'gx-note', text: 'You can change these any time from the toolbar icon or the extension’s Options page.' }));

    const go = el('button', { type: 'button', class: 'gx-go', text: 'Get started' });
    go.addEventListener('click', finish);

    const panel = el('div', { class: 'gx-panel' },
      el('header', { class: 'gx-head' }, title, intro),
      el('div', { class: 'gx-cols' }, list, card),
      el('div', { class: 'gx-actions' }, go),
      el('p', { class: 'gx-foot', text: 'Unofficial. Not affiliated with Grove City College. Your myGCC data stays on this computer.' }));

    const root = el('div', { id: ID, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gccx-onboarding-title' }, panel);
    return { root, title };
  }

  function show() {
    if (document.getElementById(ID) || !document.body) return;
    const { root, title } = build();
    document.documentElement.classList.add(LOCK);
    document.body.append(root);
    sync();
    root.scrollTop = 0;
    title.focus({ preventScroll: true });

    // Keep focus inside the dialog.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...root.querySelectorAll('button, input')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function finish() {
    if (hasChrome()) {
      try { chrome.storage.local.set({ onboarding: 'done' }); } catch (_) { /* ignore */ }
    }
    hide();
    window.dispatchEvent(new Event('gccx:onboarding-done'));
  }

  function hide() {
    document.getElementById(ID)?.remove();
    document.documentElement.classList.remove(LOCK);
  }

  function open() {
    if (!hasChrome()) return;
    chrome.storage.local.get('settings', ({ settings: s }) => {
      settings = { ...DEFAULTS, ...(s || {}) };
      show();
    });
  }

  function init() {
    if (!hasChrome()) return;
    chrome.storage.local.get('onboarding', ({ onboarding }) => {
      if (onboarding === 'pending') open();
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area && area !== 'local') return;
      if (ch.onboarding?.newValue === 'pending') open();
      else if (ch.onboarding && ch.onboarding.newValue !== 'pending') hide();
      if (ch.settings && document.getElementById(ID)) {
        settings = { ...DEFAULTS, ...(ch.settings.newValue || {}) };
        sync();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
