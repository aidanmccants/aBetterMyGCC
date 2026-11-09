'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js', 'machines.js');
const M = X.machines;
const EVENTS = ['START', 'STOP', 'STOPPED', 'FINISH', 'FAIL', 'RESET'];
const EXPECT = {
  idle: { START: 'running' },
  running: { STOP: 'stopping', FINISH: 'done', FAIL: 'error' },
  stopping: { STOPPED: 'done', FINISH: 'done', FAIL: 'error' },
  done: { START: 'running', RESET: 'idle' },
  error: { START: 'running', RESET: 'idle' },
};

test('AI run table is exactly the expected one', () => assert.deepEqual(M.aiRun, EXPECT));

test('every AI run state takes its allowed moves and refuses every other event', () => {
  for (const [state, moves] of Object.entries(M.aiRun)) for (const ev of EVENTS) {
    const m = X.machine('plan-ai', { initial: state, states: M.aiRun });
    assert.equal(m.send(ev), !!moves[ev], `${state} + ${ev}`);
    assert.equal(m.state, moves[ev] || state);
  }
});

test('named refusals: one per state', () => {
  const refuse = { idle: 'STOP', running: 'START', stopping: 'STOP', done: 'STOP', error: 'FINISH' };
  for (const [state, ev] of Object.entries(refuse)) assert.equal(X.machine('ask-ai', { initial: state, states: M.aiRun }).send(ev), false, `${state} ${ev}`);
});

test('a second run cannot start while one is running or stopping', () => {
  assert.equal(M.aiRun.running.START, undefined);
  assert.equal(M.aiRun.stopping.START, undefined);
  assert.equal(M.aiBusy('running'), true);
  assert.equal(M.aiBusy('stopping'), true);
  for (const s of ['idle', 'done', 'error']) assert.equal(M.aiBusy(s), false, s);
});

test('restoreAiRun: a finished run comes back as it was', () => {
  const run = { state: 'done', input: 'COMP 220', log: [{ text: 'Added COMP 220 A: Software Engineering' }], summary: 'Added COMP 220 A.', error: '', note: '' };
  assert.deepEqual(M.restoreAiRun(run), run);
  const failed = { state: 'error', input: 'x', log: [], summary: '', error: 'The AI service is rate-limiting this key.' };
  assert.deepEqual(M.restoreAiRun(failed), failed);
});

test('restoreAiRun: a run saved mid-way is shown as interrupted, with its log kept', () => {
  for (const state of ['running', 'stopping']) {
    const run = M.restoreAiRun({ state, input: 'COMP 220, STAT 131', log: [{ text: 'Searching COMP 220…' }, { text: 'Added COMP 220 A: Software Engineering' }], summary: '', error: '' });
    assert.equal(run.state, 'error');
    assert.equal(run.interrupted, true);
    assert.match(run.error, /interrupted/);
    assert.equal(run.log.length, 2);
    assert.equal(run.input, 'COMP 220, STAT 131');
  }
});

test('restoreAiRun: old-shape runs (running / stopped booleans) convert', () => {
  const done = M.restoreAiRun({ running: false, stopped: false, input: 'x', log: [], summary: 'Done.', error: '' });
  assert.equal(done.state, 'done');
  assert.equal('running' in done, false);
  assert.equal('stopped' in done, false);
  assert.equal(done.summary, 'Done.');
  assert.equal(M.restoreAiRun({ running: false, input: 'x', log: [], summary: '', error: 'Stopped.' }).state, 'error');
  const mid = M.restoreAiRun({ running: true, input: 'x', log: [], summary: '', error: '' });
  assert.equal(mid.state, 'error');
  assert.equal(mid.interrupted, true);
});

test('restoreAiRun: nothing saved, or junk, gives null; missing fields are filled', () => {
  assert.equal(M.restoreAiRun(null), null);
  assert.equal(M.restoreAiRun('x'), null);
  const bare = M.restoreAiRun({ state: 'done' });
  assert.deepEqual(bare.log, []);
  assert.equal(bare.input, '');
  assert.equal(M.restoreAiRun({ state: 'nonsense', error: '' }).state, 'done');
});
