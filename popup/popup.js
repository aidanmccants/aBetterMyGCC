const DEFAULTS = { enabled: true, theme: 'auto', dashboard: true, hidePromos: true, hideGpa: true, hall: 'hicks-cafe' };
const NAMES = { anthropic: 'Claude', openai: 'OpenAI', xai: 'Grok', google: 'Gemini' };
const $ = (s) => document.querySelector(s);

// ---------- look settings ----------
chrome.storage.local.get('settings', ({ settings }) => {
  const s = { ...DEFAULTS, ...(settings || {}) };
  const save = async (key, value) => { const { settings: latest } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...(latest || {}), [key]: value } }); };
  document.querySelectorAll('input[data-key]').forEach((el) => {
    el.checked = !!s[el.dataset.key];
    el.addEventListener('change', () => { s[el.dataset.key] = el.checked; save(el.dataset.key, el.checked); });
  });
  const btns = document.querySelectorAll('[data-theme]');
  const mark = () => btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === s.theme)));
  btns.forEach((b) => {
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { s.theme = b.dataset.theme; mark(); save('theme', s.theme); });
  });
  mark();
});

// ---------- everything else lives on the Settings page ----------
document.querySelector('#advanced').addEventListener('click', async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});
