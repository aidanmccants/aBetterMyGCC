// aBetterMyGCC service worker: fetches public dining menus from Nutrislice (the
// college's menu provider), and, only if you add your own AI key, talks to
// the AI service you chose for "Plan with AI".
importScripts('ai.js', 'devreload.js');
const API = 'https://gcc.api.nutrislice.com/menu/api';

// Meal windows (Eastern time). Weekend MAP is closed; Fri MAP dinner closed.
const MEALS = {
  'hicks-cafe': [
    { slug: 'breakfast', name: 'Breakfast', from: 7 * 60, to: 11 * 60 },
    { slug: 'lunch', name: 'Lunch', from: 11 * 60, to: 16 * 60 + 30 },
    { slug: 'dinner', name: 'Dinner', from: 16 * 60 + 30, to: (d) => (d === 0 || d === 6 ? 19 * 60 : 21 * 60) },
  ],
  'map-cafe': [
    { slug: 'breakfast', name: 'Breakfast', from: 7 * 60, to: 11 * 60, days: [1, 2, 3, 4, 5] },
    { slug: 'lunch', name: 'Lunch', from: 11 * 60, to: (d) => (d === 5 ? 14 * 60 + 30 : 16 * 60 + 30), days: [1, 2, 3, 4, 5] },
    { slug: 'dinner', name: 'Dinner', from: 16 * 60 + 30, to: 20 * 60, days: [1, 2, 3, 4] },
  ],
};

function easternNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { y: parts.year, m: parts.month, d: parts.day, iso: `${parts.year}-${parts.month}-${parts.day}`, mins: +parts.hour * 60 + +parts.minute, dow };
}
const fmt = (min) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${min < 720 ? 'AM' : 'PM'}`;

function pickMeal(hall, now) {
  const meals = (MEALS[hall] || MEALS['hicks-cafe']).filter((m) => !m.days || m.days.includes(now.dow));
  const end = (m) => (typeof m.to === 'function' ? m.to(now.dow) : m.to);
  const current = meals.find((m) => now.mins >= m.from && now.mins < end(m));
  if (current) return { meal: current, until: fmt(end(current)), later: false };
  const next = meals.find((m) => now.mins < m.from);
  if (next) return { meal: next, until: null, later: true, startsAt: fmt(next.from) };
  return null;
}

function parseDay(json, iso) {
  const day = (json.days || []).find((d) => d.date === iso);
  if (!day) return null;
  const stations = [];
  let cur = null;
  for (const it of day.menu_items || []) {
    if (it.is_section_title || it.is_station_header) {
      cur = { name: (it.text || '').trim(), items: [] };
      stations.push(cur);
    } else if (it.food && it.food.name) {
      if (!cur) { cur = { name: 'Menu', items: [] }; stations.push(cur); }
      if (!cur.items.includes(it.food.name.trim())) cur.items.push(it.food.name.trim());
    }
  }
  return stations.filter((s) => s.items.length);
}

async function getMenu(hall) {
  const now = easternNow();
  const pick = pickMeal(hall, now);
  const hallName = hall === 'map-cafe' ? 'MAP' : 'Hicks';
  if (!pick) return { closed: true, message: `${hallName} is closed for the rest of today.` };
  const key = `menu:${hall}:${pick.meal.slug}:${now.iso}`;
  const hit = (await chrome.storage.local.get(key))[key];
  let stations = hit && Date.now() - hit.ts < 3 * 3600e3 ? hit.stations : null;
  if (!stations) {
    const res = await fetch(`${API}/weeks/school/${hall}/menu-type/${pick.meal.slug}/${now.y}/${now.m}/${now.d}/`);
    if (!res.ok) throw new Error('menu ' + res.status);
    stations = parseDay(await res.json(), now.iso) || [];
    await chrome.storage.local.set({ [key]: { ts: Date.now(), stations } });
  }
  return {
    meal: pick.later ? `${pick.meal.name} at ${pick.startsAt}` : pick.meal.name,
    until: pick.until,
    stations,
  };
}

// ---- live log: forwarded to open log pages only, never stored ----
const logPorts = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'gccx-log') return;
  logPorts.add(port);
  port.onDisconnect.addListener(() => logPorts.delete(port));
});
function emitLog(level, source, message, data) {
  if (!logPorts.size) return;
  const entry = { type: 'log', level, source, message: String(message), data, ts: Date.now() };
  for (const p of logPorts) { try { p.postMessage(entry); } catch (e) { logPorts.delete(p); } }
}
self.addEventListener('error', (e) => emitLog('error', 'background', e.message, { file: e.filename, line: e.lineno, stack: e.error && e.error.stack }));
self.addEventListener('unhandledrejection', (e) => emitLog('error', 'background', 'Unhandled rejection: ' + ((e.reason && e.reason.message) || e.reason), { stack: e.reason && e.reason.stack }));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg && msg.type === 'log') {
    emitLog(msg.level, msg.source || 'content', msg.message, msg.data);
    return false;
  }
  if (msg && msg.type === 'menu') {
    getMenu(msg.hall || 'hicks-cafe').then(reply, () => reply(null));
    return true;
  }
  // The key never leaves the service worker: pages ask, the worker adds it.
  if (msg && msg.type === 'ai-chat') {
    chrome.storage.local.get('ai', ({ ai }) => {
      if (!ai || !ai.key) return reply({ error: 'Set up Plan with AI from the aBetterMyGCC toolbar icon first.', kind: 'auth' });
      const src = msg.src || 'ai';
      const last = msg.messages[msg.messages.length - 1];
      emitLog('ai', src, `Request to ${ai.provider || 'AI'} · ${ai.model} (${msg.messages.length} messages${msg.noTools ? ', tools disabled' : ''})`, {
        system: msg.messages.length <= 1 ? msg.system : '(same system prompt as first request)' + (msg.noTools ? ' + final-answer instruction' : ''),
        tools: (msg.tools || []).map((t) => t.name),
        latestMessage: last && (last.text || last.results || last.native),
      });
      const t0 = Date.now();
      GCCX_AI.aiChat({ provider: ai.provider, key: ai.key, model: ai.model, system: msg.system, tools: msg.tools, messages: msg.messages, noTools: !!msg.noTools })
        .then((r) => {
          emitLog('ai', src, `Response (${r.stop}) in ${Date.now() - t0} ms`, { text: r.text, toolCalls: r.toolCalls });
          reply({ ok: r });
        }, (e) => {
          emitLog('error', src, `AI request failed (${e.kind || 'request'}): ${e.message || e}`);
          reply({ error: e.message || String(e), kind: e.kind || 'request' });
        });
    });
    return true;
  }
  if (msg && msg.type === 'ai-models') {
    GCCX_AI.aiModels({ provider: msg.provider, key: msg.key })
      .then((r) => reply({ ok: r }), (e) => reply({ error: e.message || String(e), kind: e.kind || 'request' }));
    return true;
  }
  if (msg && msg.type === 'ai-status') {
    chrome.storage.local.get('ai', ({ ai }) => reply({ ready: !!(ai && ai.key && ai.model), provider: ai && ai.provider, model: ai && ai.model }));
    return true;
  }
});

// Drop old menu cache entries once a day
chrome.runtime.onStartup.addListener(async () => {
  const all = await chrome.storage.local.get(null);
  const today = easternNow().iso;
  const stale = Object.keys(all).filter((k) => k.startsWith('menu:') && !k.endsWith(today));
  if (stale.length) chrome.storage.local.remove(stale);
});

// First run: open myGCC, where the welcome screen (onboarding.js) appears.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;
  chrome.storage.local.set({ onboarding: 'pending' }, () => chrome.tabs.create({ url: 'https://my.gcc.edu/ICS/' }));
});
