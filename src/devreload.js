// Developer auto-reload. Only active when the extension is loaded unpacked
// ("Load unpacked" in chrome://extensions); the Web Store build skips it.
// While a myGCC tab is open, it re-reads the extension's own files every 1.5s.
// When any of them changes it reloads the extension, then the myGCC tabs.
(function () {
  const FILES = [
    'manifest.json', 'themes/index.json', 'themes/gcc/theme.json', 'themes/autumn-pixels/theme.json', 'src/theme-engine/default-theme.js', 'src/theme-engine/runtime.js', 'src/theme-engine/settings.js', 'src/theme-engine/loader.js', 'src/theme-engine/tokens.css', 'src/theme-engine/fonts.css', 'src/facilities.js', 'src/theme-engine/shell.css',
    'src/lib.js', 'src/machines.js', 'src/terms.js', 'src/content.js', 'src/builder.js', 'src/contrast.js',
    'src/onboarding.js', 'src/degree.js', 'src/signedout.js', 'src/theme.css', 'src/chapel.js',
    'src/signedout.css', 'src/onboarding.css', 'src/builder-split.css', 'src/degree.css', 'src/search.css',
    'src/background.js', 'src/ai.js', 'src/devreload.js',
    'src/links.js', 'src/community.js', 'src/community.css', 'src/forums.js', 'src/forums.css', 'src/quicklinks.css', 'src/home-portlets.js', 'src/home-portlets.css', 'src/whatsnew.js', 'src/whatsnew.css', 'src/feedback.js', 'src/feedback.css', 'src/academics.js', 'src/academics.css', 'src/myinfo.js', 'src/myinfo.css', 'src/advsearch.css','src/searchnote.js', 'src/searchnote.css', 'src/framefit.js', 'src/loading.js', 'src/loading.css',
    'logs/log.html', 'logs/log.js', 'logs/log.css', 'options/options.html', 'options/options.js', 'options/options.css',
    'popup/popup.html', 'popup/popup.js', 'popup/popup.css',
    'demo/index.html', 'demo/chapel.html', 'demo/server.js', 'demo/shim.js', 'demo/demo.css',
  ];
  let isDev = false;
  let last = null;
  let timer = null;

  async function snapshot() {
    const parts = await Promise.all(FILES.map(async (f) => {
      try {
        const r = await fetch(chrome.runtime.getURL(f), { cache: 'no-store' });
        return r.ok ? await r.text() : '';
      } catch (e) { return ''; }
    }));
    // cheap fingerprint: length + rolling hash per file
    return parts.map((t) => {
      let h = 0;
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
      return t.length + ':' + h;
    }).join('|');
  }

  async function check() {
    const now = await snapshot();
    if (last === null) { last = now; return; }
    if (now !== last) {
      clearInterval(timer);
      await chrome.storage.local.set({ devReloadTabs: Date.now() });
      chrome.runtime.reload();
    }
  }

  function start() {
    if (!isDev || timer) return;
    timer = setInterval(check, 1500);
    check();
  }

  chrome.management.getSelf((me) => {
    isDev = me && me.installType === 'development';
    if (!isDev) return;
    // After a dev reload, refresh any open myGCC tabs so new content scripts load.
    chrome.storage.local.get('devReloadTabs', ({ devReloadTabs }) => {
      if (!devReloadTabs || Date.now() - devReloadTabs > 30000) return;
      chrome.storage.local.remove('devReloadTabs');
      chrome.tabs.query({ url: ['https://my.gcc.edu/*'] }, (tabs) => tabs.forEach((t) => chrome.tabs.reload(t.id)));
    });
    start();
  });

  // myGCC tabs ping every 20s in dev mode, which keeps this worker (and the
  // file check) running while you're looking at the site.
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.type === 'dev-ping') { start(); reply({ dev: isDev }); }
  });
})();
