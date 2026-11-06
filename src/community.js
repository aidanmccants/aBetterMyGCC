// aBetterMyGCC "Community" tab: a dropdown in the top nav listing student-made
// tools. To add a tool, add an object to COMMUNITY_TOOLS below.
(function () {
  'use strict';
  const COMMUNITY_TOOLS = [
    { name: 'Plate', url: 'https://plate.mccants.link', desc: "Plan your meals from GCC's dining menus." },
    { name: "Munson's study tool", url: 'https://www.rysaiah.com/civarts/', desc: 'A study tool for Civ Arts.' },
  ];
  const FOOTER = 'Community-made, not affiliated with Grove City College.';

  const root = document.documentElement;
  const TAB_ID = 'gccx-community-tab', PANEL_ID = 'gccx-community-panel';
  let panel = null, btn = null;

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    (kids || []).forEach((k) => n.appendChild(k));
    return n;
  }

  function buildPanel() {
    const p = el('div', { id: PANEL_ID, className: 'gccx-community-panel', hidden: true });
    p.setAttribute('role', 'region');
    p.setAttribute('aria-label', 'Community tools');
    const list = el('ul', { className: 'gccx-community-list' });
    COMMUNITY_TOOLS.forEach((t) => {
      const a = el('a', { className: 'gccx-community-item', href: t.url, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { className: 'gccx-community-name', textContent: t.name }),
        el('span', { className: 'gccx-community-desc', textContent: t.desc }),
      ]);
      list.appendChild(el('li', {}, [a]));
    });
    p.appendChild(list);
    p.appendChild(el('p', { className: 'gccx-community-foot', textContent: FOOTER }));
    return p;
  }

  function position() {
    if (!panel || !btn) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    panel.style.width = w + 'px';
    panel.style.top = Math.round(r.bottom + 4) + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  }

  function isOpen() { return panel && !panel.hidden; }

  function open() {
    if (!panel) return;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    position();
    const first = panel.querySelector('a');
    if (first) first.focus();
  }

  function close(refocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }

  function mount() {
    const on = root.classList.contains('gccx');
    const nav = document.getElementById('main-nav');
    const existing = document.getElementById(TAB_ID);
    if (!on || !nav) {
      if (existing && !on) { close(false); existing.remove(); if (panel) panel.remove(); panel = btn = null; }
      return;
    }
    if (existing && nav.contains(existing) && panel && panel.isConnected) return;
    if (existing) existing.remove();
    if (panel) panel.remove();

    btn = el('button', { type: 'button', className: 'gccx-community-btn', textContent: 'Community' });
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', PANEL_ID);
    btn.setAttribute('aria-haspopup', 'true');
    const li = el('li', { id: TAB_ID, className: 'gccx-community-tab' }, [btn]);
    nav.appendChild(li);
    panel = buildPanel();
    document.body.appendChild(panel);

    btn.addEventListener('click', () => (isOpen() ? close(false) : open()));
  }

  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    close(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(true); }
  });
  document.addEventListener('focusin', (e) => {
    if (isOpen() && !panel.contains(e.target) && !(btn && btn.contains(e.target))) close(false);
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);

  // Re-mount if the nav is re-rendered or the extension is toggled.
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; try { mount(); } catch (_) {} }, 100);
  };
  function init() {
    mount();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
