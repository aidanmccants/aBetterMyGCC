// Runs inside custom.gcc.edu pages that myGCC embeds in fixed-size, non-scrolling frames
// (Chapel Attendance, Student Self-Service / transcript ordering, ...). Makes the page fit
// the frame's width and reports its real height so the myGCC page can size the frame
// (GCCX.fitFrame in lib.js) instead of clipping the text.
(function () {
  'use strict';
  if (window.top === window) return; // opened directly: leave it alone

  const css = document.createElement('style');
  css.textContent = `
    html, body { margin: 0 !important; overflow-x: hidden !important; max-width: 100% !important; }
    body { padding: 4px 2px !important; line-height: 1.45 !important; }
    table, td, th, div, [width] { max-width: 100% !important; }
    table[width], td[width], div[style*="width"] { width: auto !important; }
    table { table-layout: auto !important; }
    td, th { word-break: normal !important; overflow-wrap: break-word !important; }
    form, form > div, [id^="pnl"] { width: auto !important; height: auto !important; max-height: none !important; overflow: visible !important; }
    a { overflow-wrap: anywhere; }
  `;
  (document.head || document.documentElement).appendChild(css);

  // Whatever still overflows (an image beside a table has a minimum width) scales to fit.
  const fit = () => {
    if (!document.body) return;
    document.body.style.zoom = '';
    const avail = document.documentElement.clientWidth, need = document.body.scrollWidth;
    if (need > avail + 1) document.body.style.zoom = String(Math.max(0.6, avail / need));
  };
  const report = () => {
    if (!document.body) return;
    fit();
    // Pages can scroll inside a panel, so measure where the content actually ends.
    const bottom = Math.max(0, ...[...document.body.querySelectorAll('*')].map((n) => n.getBoundingClientRect().bottom));
    const height = Math.ceil(Math.max(bottom + window.scrollY + 8, document.body.scrollHeight));
    try { window.parent.postMessage({ gccxFrame: location.pathname, height }, 'https://my.gcc.edu'); } catch (e) { /* not embedded by myGCC */ }
  };

  report();
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener('load', report);
  // The parent may start listening after our first reports: answer when it asks.
  window.addEventListener('message', (e) => {
    if (e.origin === 'https://my.gcc.edu' && e.data && e.data.gccxFrameAsk) report();
  });
})();
