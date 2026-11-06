// aBetterMyGCC live log. Entries arrive over a port from the background and live only in
// this page's memory: closing the tab discards them. Nothing is written to storage.
(function () {
  'use strict';
  const out = document.getElementById('out');
  const status = document.getElementById('status');
  const fLevel = document.getElementById('level');
  const fSource = document.getElementById('source');
  const MAX = 2000;
  let count = 0;
  let stick = true; // follow new entries until the user scrolls up

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour12: false }) + '.' + String(new Date(ts).getMilliseconds()).padStart(3, '0');
  const SRC = { ask: 'Ask AI', plan: 'Plan', content: 'Page', background: 'Background' };
  const LEVELS = ['info', 'warn', 'error', 'ai'];

  function render(e) {
    const level = LEVELS.includes(e.level) ? e.level : 'info';
    const el = document.createElement('div');
    el.className = 'e ' + level;
    el.dataset.level = level;
    el.dataset.source = e.source || '';
    el._entry = e;
    let data = '';
    if (e.data !== undefined && e.data !== null) {
      let txt;
      try { txt = typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2); } catch (x) { txt = String(e.data); }
      const long = txt.length > 160 || txt.includes('\n');
      data = long ? `<details><summary>details (${txt.length.toLocaleString()} chars)</summary><pre>${esc(txt)}</pre></details>` : `<pre>${esc(txt)}</pre>`;
    }
    el.innerHTML = `<span class="t">${time(e.ts)}</span><span class="lv">${esc(level)}</span><span class="src">${esc(SRC[e.source] || e.source)}</span><span class="m">${esc(e.message)}</span>${data}`;
    applyFilter(el);
    return el;
  }
  function applyFilter(el) {
    el.hidden = !!((fLevel.value && el.dataset.level !== fLevel.value) || (fSource.value && el.dataset.source !== fSource.value));
  }
  function add(e) {
    out.appendChild(render(e));
    if (++count > MAX) { out.firstElementChild.remove(); count--; }
    if (stick) out.scrollTop = out.scrollHeight;
  }

  out.addEventListener('scroll', () => { stick = out.scrollHeight - out.scrollTop - out.clientHeight < 40; });
  [fLevel, fSource].forEach((f) => f.addEventListener('change', () => { [...out.children].forEach(applyFilter); if (stick) out.scrollTop = out.scrollHeight; }));
  // Copy every entry (ignores filters) as plain text, with full details payloads
  const copyBtn = document.getElementById('copy');
  copyBtn.addEventListener('click', async () => {
    const text = [...out.children].map((el) => {
      const e = el._entry || {};
      let line = `${time(e.ts)} ${e.level || 'info'} ${SRC[e.source] || e.source || ''} ${e.message || ''}`;
      if (e.data !== undefined && e.data !== null) {
        try { line += '\n' + (typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)); } catch (x) { line += '\n' + String(e.data); }
      }
      return line;
    }).join('\n');
    try { await navigator.clipboard.writeText(text || '(log is empty)'); copyBtn.textContent = `Copied ${out.children.length}`; }
    catch (x) { copyBtn.textContent = 'Copy failed'; }
    setTimeout(() => { copyBtn.textContent = 'Copy all'; }, 1500);
  });
  document.getElementById('clear').addEventListener('click', () => { out.textContent = ''; count = 0; });

  function connect() {
    const port = chrome.runtime.connect({ name: 'gccx-log' });
    status.textContent = 'Live';
    status.className = 'status on';
    port.onMessage.addListener((m) => { if (m && m.type === 'log') add(m); });
    port.onDisconnect.addListener(() => {
      status.textContent = 'Disconnected, reconnecting…';
      status.className = 'status';
      setTimeout(connect, 1000); // the service worker may have restarted
    });
  }
  connect();
  add({ level: 'info', source: 'background', message: 'Log opened. Use Ask AI, Plan with AI or browse myGCC to see activity.', ts: Date.now() });
})();
