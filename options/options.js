// ---------- general settings (same storage as the popup) ----------
const DEFAULTS = { enabled: true, theme: 'auto', dashboard: true, hidePromos: true, hideGpa: true, hall: 'hicks-cafe' };
chrome.storage.local.get('settings', ({ settings }) => {
  const st = { ...DEFAULTS, ...(settings || {}) };
  const save = async (key, value) => { const { settings: latest } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...(latest || {}), [key]: value } }); };
  document.querySelectorAll('.prefs [data-key]').forEach((el) => {
    const k = el.dataset.key;
    if (el.type === 'checkbox') el.checked = !!st[k]; else el.value = st[k];
    el.addEventListener('change', () => { st[k] = el.type === 'checkbox' ? el.checked : el.value; save(k, st[k]); });
  });
});

const ORIGINS = {
  anthropic: 'https://api.anthropic.com/*',
  openai: 'https://api.openai.com/*',
  xai: 'https://api.x.ai/*',
  google: 'https://generativelanguage.googleapis.com/*',
};
const NAMES = { anthropic: 'Claude', openai: 'OpenAI', xai: 'Grok', google: 'Gemini' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function detect(key) {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('AIza')) return 'google';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}
const send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, r));

function fillModels(models, selected) {
  const sel = $('#model');
  if (!models.length) {
    sel.innerHTML = '<option>Save a key to load models</option>';
    sel.disabled = true;
    return;
  }
  sel.innerHTML = models.map((m) => {
    const label = m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id;
    return `<option value="${esc(m.id)}">${esc(label)}</option>`;
  }).join('');
  sel.disabled = false;
  if (selected && models.some((m) => m.id === selected)) sel.value = selected;
}

// ---------- AI setup: one state decides the button label and the message ----------
// none | verifying | needs-permission | invalid | needs-model | ready
// (table: GCCX.machines.aiSetup in src/machines.js; diagram: docs/STATE_MACHINES.md).
// The background reports the same states (minus verifying / invalid, which exist only while
// this page is open), so Settings, Ask AI and Plan with AI always agree.
let setup = null;  // the machine, created once the saved state is known
let detail = {};   // what the current state's message needs: provider, model, reason, saved, removed
let checks = 0;    // drops the result of a check that was overtaken by a newer click
const who = (p) => NAMES[p] || p || 'the AI service';
const VIEW = {
  none: (d) => ({ label: 'Save key', text: d.removed ? 'Key removed.' : '' }),
  verifying: () => ({ label: 'Save key', text: 'Checking key…', busy: true }),
  'needs-permission': (d) => ({ label: 'Save key', text: `Chrome needs permission to reach ${who(d.provider)}. Choose Allow access, then Allow.`, bad: true, allow: true }),
  invalid: (d) => ({ label: 'Save key', text: d.reason || 'That key did not work.', bad: true }),
  'needs-model': () => ({ label: 'Continue setup', text: 'Your key is saved. Choose Continue setup to finish.' }),
  ready: (d) => ({ label: 'Save key', text: `${d.saved ? 'Saved. ' : ''}Using ${who(d.provider)} · ${d.model}.` }),
};
// `hint` is a one-off note about what was typed (nothing saved, state unchanged)
function render(hint) {
  if (!setup) return;
  const v = VIEW[setup.state](detail);
  $('#save').textContent = v.label;
  $('#save').disabled = !!v.busy;
  $('#allow').hidden = !v.allow;
  $('#msg').textContent = hint || v.text;
  $('#msg').classList.toggle('bad', !!(hint || v.bad));
}

chrome.storage.local.get('ai', async ({ ai }) => {
  if (ai && ai.key) {
    $('#key').value = ai.key;
    $('#provider').value = ai.provider || '';
    const list = ai.models && ai.models.length ? ai.models : (ai.model ? [{ id: ai.model, name: ai.model }] : []);
    fillModels(list, ai.model);
  }
  // The background checks Chrome's permission too, so a key whose access was switched off in
  // chrome://extensions shows as needs-permission here instead of looking ready.
  const st = await send({ type: 'ai-status' });
  detail = { provider: (st && st.provider) || (ai && ai.provider) || '', model: (st && st.model) || '' };
  const initial = st && GCCX.machines.aiSetup[st.state] ? st.state : 'none';
  setup = GCCX.machine('ai-setup', { initial, states: GCCX.machines.aiSetup, el: $('#ai') });
  render();
});

// Ask Chrome for access to one service, then check the key by loading its models.
// Called straight from a click (Save key or Allow access): the permission prompt needs the user gesture.
async function verify(provider, key) {
  const my = ++checks;
  const stale = () => my !== checks || setup.state !== 'verifying';
  const granted = await chrome.permissions.request({ origins: [ORIGINS[provider]] });
  if (stale()) return;
  if (!granted) { setup.send('DENIED', { provider }); return render(); }
  const r = await send({ type: 'ai-models', provider, key });
  if (stale()) return;
  const models = r && r.ok ? r.ok.models.slice(0, 40) : [];
  if (!r || r.error || !models.length) {
    detail.reason = !r || r.error
      ? (r && r.kind === 'auth' ? `${who(provider)} rejected this key.` : `Couldn't load models: ${r ? r.error : 'no response'}`)
      : 'That key works, but no chat models came back for it.';
    setup.send('REJECTED', { provider, kind: (r && r.kind) || 'no-models' });
    return render();
  }
  const current = $('#model').disabled ? null : $('#model').value;
  fillModels(models, current);
  const ai = { provider, key, model: $('#model').value, models };
  await chrome.storage.local.set({ ai });
  if (stale()) return;
  $('#provider').value = provider;
  detail = { provider, model: ai.model, saved: true };
  setup.send('VERIFIED', { provider, model: ai.model });
  render();
}

$('#save').addEventListener('click', async () => {
  if (!setup) return;
  const key = $('#key').value.trim();
  if (!key) return render('Paste a key first.');
  const provider = $('#provider').value || detect(key);
  if (!provider) return render("Couldn't tell which service this key is from. Pick it under Service.");
  if (!setup.send('SAVE', { provider })) return;
  detail = { provider };
  render();
  // Keep the key before the permission prompt, which can close this page and lose what was typed
  await chrome.storage.local.set({ ai: { provider, key, model: '', models: [] } });
  await verify(provider, key);
});

// needs-permission: ask Chrome again (it only shows its prompt in answer to a click)
$('#allow').addEventListener('click', () => {
  const key = $('#key').value.trim();
  const provider = detail.provider || $('#provider').value || detect(key);
  if (!setup || !key || !provider || !setup.send('ALLOW', { provider })) return;
  detail = { provider };
  render();
  verify(provider, key);
});

$('#model').addEventListener('change', async () => {
  const { ai } = await chrome.storage.local.get('ai');
  if (!ai || !setup) return;
  ai.model = $('#model').value;
  await chrome.storage.local.set({ ai });
  detail = { provider: ai.provider, model: ai.model };
  setup.send('PICK', { model: ai.model }); // refused (and the message unchanged) unless the key is usable
  render();
});

$('#clear').addEventListener('click', async () => {
  const { ai } = await chrome.storage.local.get('ai');
  await chrome.storage.local.remove('ai');
  if (ai && ORIGINS[ai.provider]) chrome.permissions.remove({ origins: [ORIGINS[ai.provider]] });
  $('#key').value = '';
  $('#provider').value = '';
  fillModels([], null);
  checks++;
  detail = { removed: true };
  if (setup) setup.send('CLEAR');
  render();
});

// Access switched off in chrome://extensions while this page is open
chrome.permissions.onRemoved.addListener((p) => {
  if (!setup || !detail.provider || !(p.origins || []).includes(ORIGINS[detail.provider]) || !setup.can('REVOKED')) return;
  setup.send('REVOKED', { provider: detail.provider });
  render();
});

// ---------- sidebar sections ----------
const PANELS = ['general', 'appearance', 'ai', 'help'];
function showPanel() {
  const raw = location.hash.slice(1);
  const id = PANELS.includes(raw) ? raw : raw === 'themes-title' ? 'appearance' : 'general';
  PANELS.forEach((p) => { document.getElementById(p).hidden = p !== id; });
  document.querySelectorAll('.side a').forEach((a) => a.toggleAttribute('aria-current', a.hash === '#' + id));
}
window.addEventListener('hashchange', showPanel);
showPanel();

// ---------- help ----------
const openTab = (url) => chrome.tabs.create({ url });
$('#demo-btn').addEventListener('click', () => openTab(chrome.runtime.getURL('demo/index.html')));
$('#openlog').addEventListener('click', () => openTab(chrome.runtime.getURL('logs/log.html')));
$('#welcome').addEventListener('click', async () => { await chrome.storage.local.set({ onboarding: 'pending' }); openTab('https://my.gcc.edu/ICS/'); });
