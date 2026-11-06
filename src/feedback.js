// aBetterMyGCC feedback: a small fixed button (bottom left) that opens a panel
// where students write a note, optionally attach a screenshot of the page, copy
// both to the clipboard, and then paste them into a Telegram chat with the author.
// The GCC-only Microsoft Form is an additional option; screenshots remain local.
// Continuing to Forms shares the prefilled draft; submission stays with the student.
(function () {
  'use strict';
  const FORM = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=YImRgxgi00yB_jAqjncdqWqev6TQoOlBr4NaXEioiUFUMEMxODY2QlBJUkFZNk85S1dKODZYU1FRSS4u';
  const NOTE_FIELD = 'r60e0cb519cc1463bbbf75f622ae219bc';
  const TYPE_FIELD = 'r0a6edc657ec44e20a9fb02ed8a4b3fdb';
  const TELEGRAM = 'https://t.me/aidanmccants';
  const EMAIL = 'abettergcc@aidanmccants.com';
  const EMAIL_SUBJECT = 'aBetterMyGCC feedback';
  const SHOT_NOTE = '\n\n(Screenshot copied to your clipboard — paste it into this email.)';
  const LABEL = 'aBetterMyGCC feedback';
  const WRAP_ID = 'gccx-feedback';
  const root = document.documentElement;

  let wrap = null, btn = null, panel = null, note = null, shotBox = null, shotChk = null;
  let copyBtn = null, status = null, thumb = null, manual = null;
  let busy = false;

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    (kids || []).forEach((k) => n.appendChild(k));
    return n;
  }

  function isOpen() { return !!panel && !panel.hidden; }

  function say(msg, kind) {
    if (!status) return;
    status.textContent = msg || '';
    status.dataset.kind = kind || '';
  }

  // ---- building the message ----
  function shortUA() {
    const ua = navigator.userAgent || '';
    const m = ua.match(/(Edg|OPR|Chrome)\/(\d+)/);
    const name = m ? ({ Edg: 'Edge', OPR: 'Opera', Chrome: 'Chrome' })[m[1]] + ' ' + m[2] : 'Unknown browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
    return name + ' on ' + os;
  }

  function version() {
    try { return chrome.runtime.getManifest().version; } catch (_) { return 'unknown'; }
  }

  function buildText() {
    const body = (note.value || '').trim() || '(no note)';
    return [
      body,
      '',
      '---',
      'Page: ' + (typeof GCCX !== 'undefined' ? GCCX.loc().pathname : location.pathname),
      'aBetterMyGCC: v' + version(),
      'Browser: ' + shortUA(),
      'Time: ' + new Date().toISOString(),
    ].join('\n');
  }

  // ---- screenshot ----
  function nextFrames(n) {
    return new Promise((resolve) => {
      const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
      step();
    });
  }

  // captureVisibleTab needs <all_urls> or activeTab, which a page button can't get, so we
  // use tab sharing instead: Chrome asks the student to share this tab once, we grab one
  // frame with our panel hidden, then stop sharing immediately. No extra permission.
  let shotBlob = null, shotUrl = '';
  async function captureScreenshot() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('unsupported');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
    });
    root.classList.add('gccx-fb-capturing');
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      await nextFrames(3);
      await new Promise((r) => setTimeout(r, 250)); // let the shared feed catch up with the hidden panel
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      return await new Promise((r) => c.toBlob(r, 'image/png'));
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      root.classList.remove('gccx-fb-capturing');
    }
  }
  async function onShotToggle() {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotBlob = null; shotUrl = ''; thumb.hidden = true;
    if (!shotChk.checked) { say(''); return; }
    say('Choose "This tab" and press Share to take the screenshot.');
    try {
      shotBlob = await captureScreenshot();
      if (!shotBlob) throw new Error('empty');
      shotUrl = URL.createObjectURL(shotBlob);
      thumb.src = shotUrl; thumb.hidden = false;
      say('Screenshot ready. Press Copy.', 'ok');
    } catch (e) {
      shotChk.checked = false;
      say(e && e.name === 'NotAllowedError' ? 'Screenshot cancelled.' : 'The screenshot could not be taken.', 'warn');
    }
    if (isOpen()) shotChk.focus();
  }

  // ---- clipboard ----
  function showManual(text) {
    manual.hidden = false;
    manual.value = text;
    manual.focus();
    manual.select();
  }

  // screenshot on top, the note and page details in a white band underneath
  async function withNote(blob, text) {
    const img = await createImageBitmap(blob);
    const W = img.width, scale = Math.max(1, W / 1280);
    const font = Math.round(18 * scale), lh = Math.round(font * 1.45), pad = Math.round(24 * scale);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const face = `${font}px "Instrument Sans", system-ui, sans-serif`;
    ctx.font = face;
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const test = line + word;
        if (line && ctx.measureText(test).width > W - pad * 2) { lines.push(line.trimEnd()); line = word.trimStart(); }
        else line = test;
      }
      lines.push(line);
    }
    c.width = W;
    c.height = img.height + pad * 2 + lines.length * lh;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = '#dde0e6';
    ctx.fillRect(0, img.height, W, Math.max(1, Math.round(scale)));
    ctx.fillStyle = '#16191f';
    ctx.font = face;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, pad, img.height + pad + i * lh));
    return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode'))), 'image/png'));
  }

  // Resolves to true when the screenshot (with the note on it) is on the clipboard.
  async function copyAll() {
    if (busy) return false;
    busy = true;
    copyBtn.disabled = true;
    manual.hidden = true;
    say('');
    let shotCopied = false;
    const shotFailed = shotChk.checked && !shotBlob;
    try {
      const text = buildText();
      const textBlob = new Blob([text], { type: 'text/plain' });
      // Chat apps paste only one clipboard format (the image wins), so the note is
      // also drawn onto the image: one paste carries both.
      let imgBlob = null;
      if (shotChk.checked && shotBlob) {
        try { imgBlob = await withNote(shotBlob, text); } catch (_) { imgBlob = shotBlob; }
      }
      let done = false;

      if (imgBlob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textBlob, 'image/png': imgBlob })]);
          say('Copied the screenshot with your note on it. Now paste into Telegram.', 'ok');
          done = shotCopied = true;
        } catch (_) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': imgBlob })]);
            say('Copied the screenshot with your note on it. Now paste into Telegram.', 'ok');
            done = shotCopied = true;
          } catch (__) { /* fall through to text only */ }
        }
      }
      if (!done) {
        try {
          await navigator.clipboard.writeText(text);
          say(shotFailed
            ? 'Copied the note. The screenshot could not be taken, so it was left out.'
            : imgBlob
              ? 'Copied the note only. The screenshot could not be copied; use the preview below, right-click it, and choose Copy image.'
              : 'Copied. Now paste into Telegram.', shotFailed || imgBlob ? 'warn' : 'ok');
        } catch (_) {
          say('Your browser blocked copying. Press Ctrl+C on the selected text below.', 'warn');
          showManual(text);
        }
      }
    } catch (_) {
      root.classList.remove('gccx-fb-capturing');
      say('Something went wrong. Try again.', 'warn');
    } finally {
      busy = false;
      copyBtn.disabled = false;
    }
    return shotCopied;
  }

  // Email button: same copy as Copy, then open a mailto: draft with the same text.
  async function emailAll() {
    if (busy) return;
    const text = buildText();
    const shotCopied = await copyAll();
    const body = shotCopied ? text + SHOT_NOTE : text;
    const url = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(EMAIL_SUBJECT) + '&body=' + encodeURIComponent(body);
    window.open(url, '_blank');
    // mailto cannot attach files, so the screenshot has to be pasted into the draft.
    if (shotCopied) say('Opened your email. Paste the screenshot into the message.', 'ok');
  }

  // ---- panel ----
  function open() {
    if (!panel) return;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    note.focus();
  }

  function close(refocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }

  function build() {
    btn = el('button', { type: 'button', className: 'gccx-fb-btn', textContent: LABEL, title: LABEL });
    btn.setAttribute('aria-label', LABEL);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', WRAP_ID + '-panel');
    btn.setAttribute('aria-haspopup', 'dialog');

    const title = el('h2', { id: WRAP_ID + '-title', className: 'gccx-fb-title', textContent: 'Send feedback' });
    const closeBtn = el('button', { type: 'button', className: 'gccx-fb-close', textContent: '×' });
    closeBtn.setAttribute('aria-label', 'Close feedback');
    closeBtn.addEventListener('click', () => close(true));

    const scope = el('p', { className: 'gccx-fb-scope', textContent: 'This is feedback for aBetterMyGCC (the extension), not for myGCC or Grove City College.' });
    const help = el('p', { id: WRAP_ID + '-help', className: 'gccx-fb-help', textContent: 'Write your note here first, then continue to the GCC-only Microsoft Form to review and send it. GCC student sign-in is required. You can also copy your note and screenshot, email them, or send them on Telegram.' });

    note = el('textarea', { id: WRAP_ID + '-note', className: 'gccx-fb-note', rows: 4, maxLength: 2000, placeholder: 'What happened, or what would help?' });
    note.setAttribute('aria-describedby', WRAP_ID + '-help');
    const noteLabel = el('label', { className: 'gccx-fb-label', htmlFor: note.id, textContent: 'Your note' });

    shotChk = el('input', { type: 'checkbox', id: WRAP_ID + '-shot' });
    shotBox = el('label', { className: 'gccx-fb-check', htmlFor: shotChk.id }, [shotChk, el('span', { textContent: 'Add a screenshot' })]);
    shotChk.addEventListener('change', onShotToggle);

    thumb = el('img', { className: 'gccx-fb-thumb', alt: 'Preview of the screenshot', hidden: true });
    manual = el('textarea', { className: 'gccx-fb-manual', rows: 5, readOnly: true, hidden: true });
    manual.setAttribute('aria-label', 'Text to copy manually');

    copyBtn = el('button', { type: 'button', className: 'gccx-fb-copy', textContent: 'Copy' });
    copyBtn.addEventListener('click', copyAll);
    const tg = el('a', { className: 'gccx-fb-tg', href: TELEGRAM, target: '_blank', rel: 'noopener noreferrer', textContent: 'Send on Telegram' });
    tg.setAttribute('aria-label', 'Send on Telegram (opens in a new tab)');
    // Email is a button, so it reuses the Telegram link's look (.gccx-fb-tg).
    const mail = el('button', { type: 'button', className: 'gccx-fb-tg', textContent: 'Email' });
    mail.setAttribute('aria-label', 'Email feedback (opens your email app)');
    mail.addEventListener('click', emailAll);
    const next = el('button', { type: 'button', className: 'gccx-fb-copy', textContent: 'Continue to feedback form' });
    next.addEventListener('click', () => {
      note.setCustomValidity(note.value.trim() ? '' : 'Write a note before continuing.');
      if (!note.reportValidity()) return;
      const url = new URL(FORM);
      url.searchParams.set(TYPE_FIELD, JSON.stringify('Issue'));
      url.searchParams.set(NOTE_FIELD, buildText());
      window.open(url.href, '_blank', 'noopener,noreferrer');
      say(shotChk.checked
        ? 'Your note and system details open in the GCC-only form. Screenshots cannot transfer automatically: use Copy, Email, or Telegram below to send the screenshot separately.'
        : 'Review your note in the GCC-only form and press Submit. If no tab opened, allow pop-ups and try again.', 'ok');
    });
    note.addEventListener('input', () => note.setCustomValidity(''));
    const privacy = el('p', { className: 'gccx-fb-help', textContent: 'Continuing shares your note, extension version, browser/OS, page path and timestamp with Microsoft Forms in a prefilled URL. Your draft is not saved by the extension.' });
    const alternatives = el('p', { className: 'gccx-fb-help', textContent: 'Other ways to send your note and screenshot:' });
    const actions = el('div', { className: 'gccx-fb-actions' }, [copyBtn, tg, mail]);

    status = el('p', { className: 'gccx-fb-status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    panel = el('div', { id: WRAP_ID + '-panel', className: 'gccx-fb-panel', hidden: true }, [
      el('div', { className: 'gccx-fb-head' }, [title, closeBtn]),
      scope, help, noteLabel, note, privacy, next, shotBox, alternatives, actions, status, thumb, manual,
    ]);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', title.id);

    btn.addEventListener('click', () => (isOpen() ? close(false) : open()));
    wrap = el('div', { id: WRAP_ID, className: 'gccx-fb' }, [panel, btn]);
    document.body.appendChild(wrap);
  }

  function teardown() {
    root.classList.remove('gccx-fb-capturing');
    const stale = document.getElementById(WRAP_ID);
    if (stale) stale.remove();
    wrap = btn = panel = note = shotBox = shotChk = copyBtn = status = thumb = manual = null;
  }

  function mount() {
    if (!document.body) return;
    const on = root.classList.contains('gccx');
    const existing = document.getElementById(WRAP_ID);
    if (!on) { if (existing) teardown(); return; }
    if (existing && wrap === existing && existing.isConnected) return;
    if (existing) teardown();
    build();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(true); }
  });

  // Re-mount if the extension is toggled or something removes the button.
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; try { mount(); } catch (_) {} }, 100);
  };
  function init() {
    mount();
    new MutationObserver(schedule).observe(document.body, { childList: true });
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
