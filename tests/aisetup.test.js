'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js', 'machines.js');
const T = X.machines.aiSetup;
const EVENTS = ['SAVE', 'ALLOW', 'DENIED', 'REJECTED', 'VERIFIED', 'PICK', 'REVOKED', 'CLEAR'];

// written out by hand, so a change to the table has to be made here on purpose
const EXPECT = {
  none: { SAVE: 'verifying', CLEAR: 'none' },
  verifying: { DENIED: 'needs-permission', REJECTED: 'invalid', VERIFIED: 'ready', CLEAR: 'none' },
  'needs-permission': { SAVE: 'verifying', ALLOW: 'verifying', CLEAR: 'none' },
  invalid: { SAVE: 'verifying', CLEAR: 'none' },
  'needs-model': { SAVE: 'verifying', PICK: 'ready', REVOKED: 'needs-permission', CLEAR: 'none' },
  ready: { SAVE: 'verifying', PICK: 'ready', REVOKED: 'needs-permission', CLEAR: 'none' },
};

test('AI setup table is exactly the expected one', () => assert.deepEqual(T, EXPECT));

test('every state takes its allowed moves and refuses every other event', () => {
  for (const [state, moves] of Object.entries(T)) {
    for (const ev of EVENTS) {
      const m = X.machine('ai-setup', { initial: state, states: T });
      assert.equal(m.send(ev), !!moves[ev], `${state} + ${ev}`);
      assert.equal(m.state, moves[ev] || state, `${state} + ${ev}`);
    }
  }
});

test('named refusals: one per state', () => {
  const refuse = { none: 'VERIFIED', verifying: 'SAVE', 'needs-permission': 'PICK', invalid: 'PICK', 'needs-model': 'VERIFIED', ready: 'ALLOW' };
  for (const [state, ev] of Object.entries(refuse)) {
    const m = X.machine('ai-setup', { initial: state, states: T });
    assert.equal(m.send(ev), false, `${state} must refuse ${ev}`);
    assert.equal(m.state, state);
  }
});

test('ready is only reachable by verifying the key or picking a model', () => {
  for (const [state, moves] of Object.entries(T)) for (const [ev, to] of Object.entries(moves)) {
    if (to === 'ready') assert.ok((state === 'verifying' && ev === 'VERIFIED') || ev === 'PICK', `${state} + ${ev}`);
  }
  assert.equal(T['needs-permission'].PICK, undefined); // no model pick can skip the permission step
});

test('every state the background reports is a state of this table, and every move lands on one', () => {
  for (const s of X.machines.AI_BACKGROUND_STATES) assert.ok(T[s], s);
  for (const moves of Object.values(T)) for (const to of Object.values(moves)) assert.ok(T[to], to);
});

test('aiErrorText uses the setup sentence when setup is not finished', () => {
  const r = { error: 'Chrome\'s permission to reach your AI service is missing.', kind: 'auth', state: 'needs-permission' };
  assert.equal(X.aiErrorText(r), r.error);
  assert.match(X.aiErrorText({ error: 'bad key', kind: 'auth' }), /key was rejected/); // a real rejection keeps its own text
  assert.match(X.aiErrorText({ error: 'x', kind: 'network' }), /Could not reach/);
  assert.match(X.aiSetupText('needs-permission'), /Allow access/);
  assert.match(X.aiSetupText('needs-model'), /no model/);
  assert.equal(X.aiSetupText('none'), '');
  assert.equal(X.aiSetupText('ready'), '');
});
