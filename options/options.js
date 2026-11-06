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
const msg = (t, bad) => { $('#msg').textContent = t; $('#msg').classList.toggle('bad', !!bad); };
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

// Button reads "Continue setup" when a key is saved but no model is chosen yet
function refresh(ai) {
  $('#save').textContent = ai && ai.key && !ai.model ? 'Continue setup' : 'Save key';
}

chrome.storage.local.get('ai', ({ ai }) => {
  if (!ai || !ai.key) return refresh(null);
  $('#key').value = ai.key;
  $('#provider').value = ai.provider || '';
  const list = ai.models && ai.models.length ? ai.models : (ai.model ? [{ id: ai.model, name: ai.model }] : []);
  fillModels(list, ai.model);
  refresh(ai);
  if (ai.model) msg(`Using ${NAMES[ai.provider] || ai.provider} · ${ai.model}.`);
  else msg('Your key is saved. Choose Continue setup to finish.');
});

$('#save').addEventListener('click', async () => {
  const key = $('#key').value.trim();
  if (!key) return msg('Paste a key first.', true);
  const provider = $('#provider').value || detect(key);
  if (!provider) return msg("Couldn't tell which service this key is from. Pick it under Service.", true);
  // Keep the key before the permission prompt, which can close this page and lose what was typed
  await chrome.storage.local.set({ ai: { provider, key, model: '', models: [] } });
  // Ask Chrome for access to just this one service (needs the click as a user gesture)
  const granted = await chrome.permissions.request({ origins: [ORIGINS[provider]] });
  if (!granted) return msg(`Chrome needs permission to reach ${NAMES[provider]}. Click Save key again and choose Allow.`, true);
  msg('Checking key…');
  const r = await send({ type: 'ai-models', provider, key });
  if (!r || r.error) return msg(r && r.kind === 'auth' ? `${NAMES[provider]} rejected this key.` : `Couldn't load models: ${r ? r.error : 'no response'}`, true);
  const models = r.ok.models.slice(0, 40);
  if (!models.length) return msg('That key works, but no chat models came back for it.', true);
  const current = $('#model').disabled ? null : $('#model').value;
  fillModels(models, current);
  const ai = { provider, key, model: $('#model').value, models };
  await chrome.storage.local.set({ ai });
  $('#provider').value = provider;
  refresh(ai);
  msg(`Saved. Using ${NAMES[provider]} · ${ai.model}.`);
});

$('#model').addEventListener('change', async () => {
  const { ai } = await chrome.storage.local.get('ai');
  if (!ai) return;
  ai.model = $('#model').value;
  await chrome.storage.local.set({ ai });
  refresh(ai);
  msg(`Using ${NAMES[ai.provider] || ai.provider} · ${ai.model}.`);
});

$('#clear').addEventListener('click', async () => {
  const { ai } = await chrome.storage.local.get('ai');
  await chrome.storage.local.remove('ai');
  if (ai && ORIGINS[ai.provider]) chrome.permissions.remove({ origins: [ORIGINS[ai.provider]] });
  $('#key').value = '';
  $('#provider').value = '';
  fillModels([], null);
  refresh(null);
  msg('Key removed.');
});
