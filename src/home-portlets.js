// Enhance the original home portlets without replacing links, forms, or postbacks.
(() => {
  'use strict';
  // #gccx-home-main: home.js moves the announcement and event portlets there (sibling of #portlet-grid)
  const selector = ':is(#portlet-grid, #gccx-home-main) .portlet';
  const root = document.documentElement;
  // Decode a single extra encoding layer as text. Escaping angle brackets before
  // parsing prevents encoded or literal markup from becoming live elements.
  function readable(text) {
    if (!/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/i.test(text)) return text;
    return new DOMParser().parseFromString(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'), 'text/html').body.textContent;
  }
  function enhance() {
    if (!root.classList.contains('gccx')) return;
    document.querySelectorAll(selector).forEach((portlet) => {
      const title = portlet.querySelector('.portlet-header-bar h3')?.textContent || '';
      const kind = /announcement/i.test(portlet.className + ' ' + title) ? 'announcements'
        : /event|calendar/i.test(portlet.className + ' ' + title) ? 'events' : '';
      if (!kind) return;
      portlet.classList.add('gccx-home-feed', 'gccx-home-' + kind);
      const body = portlet.querySelector('.pSection, .portlet-content, .portlet-body');
      if (!body) return;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const edits = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('script, style, textarea, input, select, [contenteditable]')) continue;
        const value = readable(node.nodeValue);
        if (value !== node.nodeValue) edits.push([node, value]);
      }
      edits.forEach(([node, value]) => { node.nodeValue = value; });
    });
  }
  function init() {
    enhance();
    const host = document.getElementById('portlet-grid');
    if (!host) return;
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; enhance(); });
    };
    // New portlet content can arrive through an ASP.NET partial postback. Watch the grid's parent
    // so portlets home.js moved next to the grid are covered too.
    new MutationObserver(schedule).observe(host.parentNode || host, { childList: true, subtree: true });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
