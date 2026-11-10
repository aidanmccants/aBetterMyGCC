'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, logs } = require('./helpers.js');

const X = load('lib.js');
const table = { idle: { START: 'running' }, running: { STOP: 'stopping', FINISH: 'done' }, stopping: { FINISH: 'done' }, done: {} };

test('starts in the initial state', () => {
  const m = X.machine('t', { initial: 'idle', states: table });
  assert.equal(m.state, 'idle');
  assert.equal(m.can('START'), true);
  assert.equal(m.can('STOP'), false);
});

test('an allowed move changes state, returns true and logs info', () => {
  logs.length = 0;
  const m = X.machine('run', { initial: 'idle', states: table });
  assert.equal(m.send('START', { why: 'test' }), true);
  assert.equal(m.state, 'running');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'info');
  assert.equal(logs[0].source, 'state');
  assert.equal(logs[0].message, 'run: idle → running');
  assert.deepEqual(logs[0].data, { why: 'test' });
});

test('a refused move keeps the state, returns false and logs a warning', () => {
  logs.length = 0;
  const m = X.machine('run', { initial: 'idle', states: table });
  assert.equal(m.send('FINISH'), false);
  assert.equal(m.state, 'idle');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].source, 'state');
  assert.match(logs[0].message, /run: FINISH is not allowed in idle/);
});

test('an unknown event and a final state both refuse', () => {
  const m = X.machine('run', { initial: 'done', states: table });
  assert.equal(m.send('START'), false);
  assert.equal(m.send('NOPE'), false);
  assert.equal(m.state, 'done');
});

test('a state missing from the table refuses instead of throwing', () => {
  const m = X.machine('run', { initial: 'ghost', states: table });
  assert.equal(m.can('START'), false);
  assert.equal(m.send('START'), false);
});

test('el (element or function) gets data-gccx-state on creation and on every move', () => {
  const el = { dataset: {} };
  const m = X.machine('t', { initial: 'idle', states: table, el });
  assert.equal(el.dataset.gccxState, 'idle');
  m.send('START');
  assert.equal(el.dataset.gccxState, 'running');
  m.send('START'); // refused: attribute unchanged
  assert.equal(el.dataset.gccxState, 'running');

  let late = null; // an element that does not exist yet
  const m2 = X.machine('t', { initial: 'idle', states: table, el: () => late });
  late = { dataset: {} };
  m2.send('START');
  assert.equal(late.dataset.gccxState, 'running');
});
