// aBetterMyGCC: AI provider layer (runs in the service worker).
// One small adapter per API shape:
//   - Anthropic (Claude): the Messages API.
//   - OpenAI, xAI (Grok), Google (Gemini): their OpenAI-compatible
//     chat-completions endpoints.
// The agent loop lives in builder.js; it calls aiChat() with a neutral
// conversation and gets back text, tool calls, and the provider's own
// assistant message to append unchanged on the next turn.

const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', origin: 'https://api.anthropic.com/*' },
  openai: { label: 'OpenAI', origin: 'https://api.openai.com/*', base: 'https://api.openai.com/v1' },
  xai: { label: 'xAI (Grok)', origin: 'https://api.x.ai/*', base: 'https://api.x.ai/v1' },
  google: { label: 'Google (Gemini)', origin: 'https://generativelanguage.googleapis.com/*', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
};

function detectProvider(key) {
  const k = (key || '').trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('AIza')) return 'google';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

class AIError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

async function readError(res) {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    msg = (e && (e.message || e.type)) || j.message || msg;
  } catch (e) { /* not JSON */ }
  const kind = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate' : res.status >= 500 ? 'server' : 'request';
  return new AIError(msg, kind);
}

// ---------------- Anthropic ----------------
const ANTHROPIC_HEADERS = (key) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2026-10-21',
  // required for calls made from a browser context
  'anthropic-dangerous-direct-browser-access': 'true',
});
// Models that accept server-side refusal fallbacks ("default" routing)
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

async function anthropicChat({ key, model, system, tools, messages }) {
  const headers = ANTHROPIC_HEADERS(key);
  const body = {
    model,
    max_tokens: 16000,
    system,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
    messages: messages.map(toAnthropic),
  };
  if (/^claude-(opus-5|fable-5|sonnet-5-5|haiku-5-5)/.test(model)) body.output_config = { effort: 'medium' };
  if (FALLBACK_MODELS.has(model)) {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw await readError(res);
  const r = await res.json();
  if (r.stop_reason === 'refusal') {
    return { stop: 'refusal', text: 'The model declined this request.', toolCalls: [], native: null };
  }
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const toolCalls = r.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));
  return {
    stop: r.stop_reason === 'tool_use' ? 'tool' : r.stop_reason === 'max_tokens' ? 'max' : 'end',
    text,
    toolCalls,
    native: { role: 'assistant', content: r.content }, // appended unchanged next turn
  };
}
function toAnthropic(m) {
  if (m.role === 'user') return { role: 'user', content: m.text };
  if (m.role === 'assistant') return m.native;
  // tool results: all in ONE user message
  return {
    role: 'user',
    content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
  };
}
async function anthropicModels(key) {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: ANTHROPIC_HEADERS(key) });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
}

// ---------------- OpenAI-compatible (OpenAI, xAI, Google) ----------------
async function compatChat(provider, { key, model, system, tools, messages }) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...messages.flatMap(toCompat)],
    tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: 'auto',
  };
  const res = await fetch(`${PROVIDERS[provider].base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const r = await res.json();
  const choice = (r.choices || [])[0];
  if (!choice) throw new AIError('The model returned no answer.', 'request');
  const msg = choice.message || {};
  const toolCalls = (msg.tool_calls || []).map((c) => {
    let input = {};
    try { input = JSON.parse(c.function.arguments || '{}'); } catch (e) { input = { __invalid: c.function.arguments }; }
    return { id: c.id, name: c.function.name, input };
  });
  const text = typeof msg.content === 'string' ? msg.content.trim() : '';
  return {
    stop: toolCalls.length ? 'tool' : choice.finish_reason === 'length' ? 'max' : choice.finish_reason === 'content_filter' ? 'refusal' : 'end',
    text,
    toolCalls,
    native: { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) },
  };
}
function toCompat(m) {
  if (m.role === 'user') return [{ role: 'user', content: m.text }];
  if (m.role === 'assistant') return [m.native];
  return m.results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content }));
}
async function compatModels(provider, key) {
  const res = await fetch(`${PROVIDERS[provider].base}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  return (j.data || j.models || []).map((m) => {
    const id = String(m.id || m.name || '').replace(/^models\//, '');
    return { id, name: m.display_name || m.displayName || id };
  }).filter((m) => m.id);
}

// Keep chat models only and put a sensible default first.
function rankModels(provider, list) {
  const chat = list.filter((m) => {
    const id = m.id.toLowerCase();
    if (/(embed|tts|whisper|dall|image|audio|realtime|moderation|transcribe|search|vision-preview|aqa|imagen|veo)/.test(id)) return false;
    if (provider === 'openai') return /^(gpt|o\d|chatgpt)/.test(id);
    if (provider === 'xai') return /^grok/.test(id);
    if (provider === 'google') return /^gemini/.test(id);
    return /^claude/.test(id);
  });
  const prefer = {
    anthropic: (id) => (id === 'claude-opus-5-5' ? 3 : /opus/.test(id) ? 2 : /sonnet/.test(id) ? 1 : 0),
    openai: (id) => (/^gpt-\d/.test(id) && !/mini|nano/.test(id) ? 2 : /^gpt/.test(id) ? 1 : 0),
    xai: (id) => (/fast|mini/.test(id) ? 0 : 1),
    google: (id) => (/pro/.test(id) ? 2 : /flash/.test(id) && !/lite/.test(id) ? 1 : 0),
  }[provider];
  const version = (id) => parseFloat((/(\d+(?:\.\d+)?)/.exec(id.replace(/-(\d)-(\d)(?!\d)/, '-$1.$2')) || [0, 0])[1]);
  return chat.sort((a, b) => prefer(b.id) - prefer(a.id) || version(b.id) - version(a.id) || b.id.localeCompare(a.id));
}

async function aiModels({ provider, key }) {
  const p = provider || detectProvider(key);
  if (!PROVIDERS[p]) throw new AIError('Pick which service this key is from.', 'request');
  const list = p === 'anthropic' ? await anthropicModels(key) : await compatModels(p, key);
  return { provider: p, models: rankModels(p, list) };
}

async function aiChat(req) {
  const p = req.provider || detectProvider(req.key);
  if (!PROVIDERS[p]) throw new AIError('Pick which service this key is from.', 'request');
  return p === 'anthropic' ? anthropicChat(req) : compatChat(p, req);
}

self.GCCX_AI = { PROVIDERS, detectProvider, aiModels, aiChat };
