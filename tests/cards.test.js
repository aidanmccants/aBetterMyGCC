'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js', 'machines.js');
const M = X.machines;
const EVENTS = ['LOADED', 'EMPTY', 'STALE', 'FAILED', 'ARRIVED', 'REFRESH'];
const EXPECT = {
  loading: { LOADED: 'ready', EMPTY: 'empty', STALE: 'stale', FAILED: 'error', ARRIVED: 'ready' },
  ready: { REFRESH: 'loading' },
  empty: { REFRESH: 'loading', ARRIVED: 'ready' },
  stale: { REFRESH: 'loading', ARRIVED: 'ready' },
  error: { REFRESH: 'loading', ARRIVED: 'ready' },
};

test('card table is exactly the expected one, for the seven dashboard sources', () => {
  assert.deepEqual(M.card, EXPECT);
  assert.deepEqual(M.CARDS, ['schedule', 'degree', 'standing', 'registration', 'chapel', 'balance', 'menu']);
});

test('every card state takes its allowed moves and refuses every other event', () => {
  for (const [state, moves] of Object.entries(M.card)) for (const ev of EVENTS) {
    const m = X.machine('card', { initial: state, states: M.card });
    assert.equal(m.send(ev), !!moves[ev], `${state} + ${ev}`);
    assert.equal(m.state, moves[ev] || state);
  }
});

test('named refusals: one per state', () => {
  const refuse = { loading: 'REFRESH', ready: 'FAILED', empty: 'STALE', stale: 'LOADED', error: 'EMPTY' };
  for (const [state, ev] of Object.entries(refuse)) assert.equal(X.machine('card', { initial: state, states: M.card }).send(ev), false, `${state} ${ev}`);
});

test('cardEvent: fresh data, saved copy after a failure, nothing, failure', () => {
  assert.equal(M.cardEvent('schedule', { courses: [] }, {}), 'LOADED');
  assert.equal(M.cardEvent('schedule', { courses: [] }, { stale: true, ts: 5 }), 'STALE');
  assert.equal(M.cardEvent('schedule', null, {}), 'EMPTY');
  assert.equal(M.cardEvent('schedule', null, { failed: true }), 'FAILED');
  assert.equal(M.cardEvent('schedule', null), 'EMPTY'); // no info at all
  assert.equal(M.cardEvent('balance', [], {}), 'EMPTY'); // an empty list is nothing to show
  assert.equal(M.cardEvent('balance', [{ label: 'Accounts Receivable', amount: 0, kind: 'Due' }], {}), 'LOADED');
  assert.equal(M.cardEvent('registration', null, {}), 'EMPTY'); // registration simply not open
  assert.equal(M.cardEvent('registration', { term: 'Spring', value: '2026;30' }, {}), 'LOADED');
});

test('cardEvent: the menu has no cache info; null means the request failed', () => {
  assert.equal(M.cardEvent('menu', null, {}), 'FAILED');
  assert.equal(M.cardEvent('menu', { closed: true, message: 'Hicks is closed' }, {}), 'LOADED');
  assert.equal(M.cardEvent('menu', { meal: 'Lunch', stations: [{ name: 'Grill', items: ['x'] }] }, {}), 'LOADED');
  assert.equal(M.cardEvent('menu', { meal: 'Lunch', stations: [] }, {}), 'EMPTY');
});

test('every cardEvent result is a move the loading state accepts', () => {
  for (const data of [null, [], {}, { stations: [] }]) for (const info of [{}, { stale: true, ts: 1 }, { failed: true }]) for (const key of M.CARDS) {
    assert.ok(M.card.loading[M.cardEvent(key, data, info)], `${key} ${JSON.stringify(data)} ${JSON.stringify(info)}`);
  }
});

test('cardsStatus and cardsFooter combine several sources', () => {
  assert.equal(M.cardsStatus(['ready', 'loading', 'error']), 'loading');
  assert.equal(M.cardsStatus(['ready', 'stale', 'error']), 'stale');
  assert.equal(M.cardsStatus(['ready', 'empty', 'error']), 'ready');
  assert.equal(M.cardsStatus(['empty', 'error']), 'error');
  assert.equal(M.cardsStatus(['empty', 'empty']), 'empty');
  assert.equal(M.cardsFooter(['ready', 'loading', 'error']), 'loading');
  assert.equal(M.cardsFooter(['ready', 'empty']), 'ok');
  assert.equal(M.cardsFooter(['ready', 'stale']), 'problem');
  assert.equal(M.cardsFooter(['ready', 'error']), 'problem');
});

test('ago', () => {
  const now = 1e12;
  assert.equal(M.ago(now - 20e3, now), 'just now');
  assert.equal(M.ago(now - 5 * 60e3, now), '5 min ago');
  assert.equal(M.ago(now - 2 * 3600e3, now), '2 h ago');
  assert.equal(M.ago(now - 72 * 3600e3, now), '3 days ago');
  assert.equal(M.ago(now + 5000, now), 'just now'); // a clock that moved back
});
