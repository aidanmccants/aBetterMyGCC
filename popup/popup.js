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

// ---------- Plan with AI (set up on the options page) ----------
function showAi(ai) {
  const ready = !!(ai && ai.key && ai.model);
  $('#ai-state').textContent = ready ? `Using ${NAMES[ai.provider] || ai.provider} · ${ai.model}` : 'Not set up';
  $('#ai-btn').textContent = ready ? 'Change' : 'Set up';
}
chrome.storage.local.get('ai', ({ ai }) => showAi(ai));

$('#ai-btn').addEventListener('click', async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});

// ---------- demo (sample student on the extension's own page; for anyone without a myGCC account) ----------
$('#demo-btn').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('demo/index.html') });
  window.close();
});

// ---------- welcome screen ----------
$('#welcome').addEventListener('click', async () => {
  await chrome.storage.local.set({ onboarding: 'pending' });
  await chrome.tabs.create({ url: 'https://my.gcc.edu/ICS/' });
  window.close();
});

// ---------- live log (AI activity and errors while that page is open; nothing is stored) ----------
$('#openlog').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('logs/log.html') });
  window.close();
});
