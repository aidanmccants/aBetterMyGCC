'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

// minimal sessionStorage and chrome.storage.local stand-ins
const session = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => { session.set(k, String(v)); },
  removeItem: (k) => { session.delete(k); },
};
const local = {};
globalThis.chrome.storage = {
  local: {
    get(key, cb) { cb(key in local ? { [key]: local[key] } : {}); },
    set(items, cb) { Object.assign(local, JSON.parse(JSON.stringify(items))); if (cb) cb(); },
    remove(key, cb) { delete local[key]; if (cb) cb(); },
  },
};

const X = load('lib.js');
const H = X.handoff;
const realNow = Date.now;
const at = (ms, fn) => { Date.now = () => ms; try { return fn(); } finally { Date.now = realNow; } };

test('session: put then take returns the value once and deletes it', () => {
  H.put('session', 'gccx-prefill', 'COMP 220', 60000);
  assert.deepEqual(Object.keys(JSON.parse(session.get('gccx-prefill'))).sort(), ['exp', 'v']);
  assert.equal(H.take('session', 'gccx-prefill'), 'COMP 220');
  assert.equal(session.has('gccx-prefill'), false);
  assert.equal(H.take('session', 'gccx-prefill'), null);
});

test('session: an expired value is not returned, and is deleted anyway', () => {
  at(1000, () => H.put('session', 'gccx-ai-run', { summary: 'x' }, 10 * 60e3));
  assert.equal(at(1000 + 10 * 60e3 + 1, () => H.take('session', 'gccx-ai-run')), null);
  assert.equal(session.has('gccx-ai-run'), false);
  at(1000, () => H.put('session', 'gccx-ai-run', { summary: 'x' }, 10 * 60e3));
  assert.deepEqual(at(1000 + 10 * 60e3 - 1, () => H.take('session', 'gccx-ai-run')), { summary: 'x' });
});

test('session: old values without exp count as expired and are removed', () => {
  session.set('gccx-prefill', 'COMP 220'); // v1.2.0 wrote the bare course code
  assert.equal(H.take('session', 'gccx-prefill'), null);
  assert.equal(session.has('gccx-prefill'), false);
  session.set('gccx-ai-run', JSON.stringify({ running: false, input: 'x', log: [], summary: 'Done', error: '' })); // old run summary
  assert.equal(H.take('session', 'gccx-ai-run'), null);
  assert.equal(session.has('gccx-ai-run'), false);
});

test('local: put then take is async, returns once, deletes', async () => {
  await H.put('local', 'devReloadTabs', true, 30000);
  assert.equal(typeof local.devReloadTabs.exp, 'number');
  assert.equal(await H.take('local', 'devReloadTabs'), true);
  assert.equal('devReloadTabs' in local, false);
  assert.equal(await H.take('local', 'devReloadTabs'), null);
});

test('local: expired and old-shape values', async () => {
  at(5000, () => { H.put('local', 'devReloadTabs', true, 30000); });
  Date.now = () => 5000 + 30001;
  try { assert.equal(await H.take('local', 'devReloadTabs'), null); } finally { Date.now = realNow; }
  assert.equal('devReloadTabs' in local, false);
  local.devReloadTabs = Date.now(); // v1.2.0 wrote a bare timestamp
  assert.equal(await H.take('local', 'devReloadTabs'), null);
  assert.equal('devReloadTabs' in local, false);
});

test('chapelPending: the new shape works with a 60-second window', async () => {
  at(1000, () => { H.put('local', 'chapelPending', { user: 'Ada Lovelace' }, 60000); });
  Date.now = () => 1000 + 59000;
  try { assert.deepEqual(await H.take('local', 'chapelPending'), { user: 'Ada Lovelace' }); } finally { Date.now = realNow; }
  at(1000, () => { H.put('local', 'chapelPending', { user: 'Ada Lovelace' }, 60000); });
  Date.now = () => 1000 + 60001;
  try { assert.equal(await H.take('local', 'chapelPending'), null); } finally { Date.now = realNow; }
});

test('chapelPending: the old { user, ts } shape is still read for 60 seconds', async () => {
  local.chapelPending = { user: 'Ada Lovelace', ts: Date.now() - 30000 };
  assert.deepEqual(await H.take('local', 'chapelPending'), { user: 'Ada Lovelace' });
  assert.equal('chapelPending' in local, false);
  local.chapelPending = { user: 'Ada Lovelace', ts: Date.now() - 61000 };
  assert.equal(await H.take('local', 'chapelPending'), null);
});

test('only chapelPending gets the old-shape exception', async () => {
  local.other = { user: 'Ada Lovelace', ts: Date.now() };
  assert.equal(await H.take('local', 'other'), null);
});
