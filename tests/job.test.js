'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js', 'machines.js');
const M = X.machines;
const END = { STOP: 'done.stopped', FAIL: 'done.failed', ABANDON: 'done.abandoned' };
const DONE = ['done.ok', 'done.stopped', 'done.abandoned', 'done.failed'];
const EVENTS = ['SEARCH', 'SKIP', 'REFS_DONE', 'OPEN', 'MISSING', 'LOST', 'REF', 'TERM', 'FILLED', 'NOTHING', 'SEND', 'SWITCHED', 'OFFPAGE', 'JUDGED', 'STOP', 'FAIL', 'ABANDON'];

// The whole table, written out by hand: any change to machines.js must be made here on purpose.
const EXPECT = {
  register: {
    'lookup.search': { SEARCH: 'lookup.results', SKIP: 'lookup.search', REFS_DONE: 'submit.fill', ...END },
    'lookup.results': { OPEN: 'lookup.details', MISSING: 'lookup.search', LOST: 'lookup.search', ...END },
    'lookup.details': { REF: 'lookup.search', LOST: 'lookup.search', ...END },
    'submit.fill': { TERM: 'submit.term', FILLED: 'done.ok', NOTHING: 'done.ok', SEND: 'submit.sent', ...END },
    'submit.term': { SWITCHED: 'submit.fill', LOST: 'submit.fill', ...END },
    'submit.sent': { OFFPAGE: 'submit.verify', JUDGED: 'submit.fill', ...END },
    'submit.verify': { JUDGED: 'submit.fill', LOST: 'submit.fill', ...END },
  },
  fill: {
    'lookup.search': { SEARCH: 'lookup.results', SKIP: 'lookup.search', REFS_DONE: 'submit.fill', ...END },
    'lookup.results': { OPEN: 'lookup.details', MISSING: 'lookup.search', LOST: 'lookup.search', ...END },
    'lookup.details': { REF: 'lookup.search', LOST: 'lookup.search', ...END },
    'submit.fill': { TERM: 'submit.term', FILLED: 'done.ok', NOTHING: 'done.ok', ...END }, // no SEND
    'submit.term': { SWITCHED: 'submit.fill', LOST: 'submit.fill', ...END },
    'submit.sent': { OFFPAGE: 'submit.verify', JUDGED: 'submit.fill', ...END }, // unreachable without SEND
    'submit.verify': { JUDGED: 'submit.fill', LOST: 'submit.fill', ...END },
  },
  lookup: {
    'lookup.search': { SEARCH: 'lookup.results', SKIP: 'lookup.search', REFS_DONE: 'done.ok', ...END },
    'lookup.results': { OPEN: 'lookup.details', MISSING: 'lookup.search', LOST: 'lookup.search', ...END },
    'lookup.details': { REF: 'lookup.search', LOST: 'lookup.search', ...END },
  },
  lookupStay: {
    'lookup.search': { SEARCH: 'lookup.results', SKIP: 'lookup.search', REFS_DONE: 'done.ok', ...END },
    'lookup.results': { OPEN: 'lookup.details', MISSING: 'lookup.search', LOST: 'lookup.search', ...END },
    'lookup.details': { REF: 'lookup.search', LOST: 'lookup.search', REFS_DONE: 'done.ok', ...END },
  },
};

for (const mode of M.JOB_MODES) {
  test(`job table for mode "${mode}" is exactly the expected one`, () => {
    const want = { ...EXPECT[mode] };
    DONE.forEach((d) => { want[d] = {}; });
    assert.deepEqual(M.jobStates(mode), want);
  });

  test(`mode "${mode}": every state takes its allowed moves and refuses every other event`, () => {
    const table = M.jobStates(mode);
    for (const [state, moves] of Object.entries(table)) {
      for (const ev of EVENTS) {
        const m = X.machine('job', { initial: state, states: table });
        if (moves[ev]) {
          assert.equal(m.send(ev), true, `${state} + ${ev}`);
          assert.equal(m.state, moves[ev], `${state} + ${ev}`);
        } else {
          assert.equal(m.send(ev), false, `${state} must refuse ${ev}`);
          assert.equal(m.state, state);
        }
      }
      assert.equal(X.machine('job', { initial: state, states: table }).send('REGISTER_NOW'), false, `${state} refuses an unknown event`);
    }
  });

  test(`mode "${mode}": every move lands on a state the table has`, () => {
    const table = M.jobStates(mode);
    for (const moves of Object.values(table)) for (const to of Object.values(moves)) assert.ok(table[to], to);
  });
}

// follow every move from a start state and collect what can be reached
function reachable(table, from) {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) for (const to of Object.values(table[todo.pop()] || {})) if (!seen.has(to)) { seen.add(to); todo.push(to); }
  return seen;
}

test('lookup modes have no submit states and no path into one', () => {
  for (const mode of ['lookup', 'lookupStay']) {
    const table = M.jobStates(mode);
    assert.equal(Object.keys(table).some((s) => s.startsWith('submit.')), false, mode);
    assert.equal([...reachable(table, 'lookup.search')].some((s) => s.startsWith('submit.')), false, mode);
  }
});

test('only a register job can reach submit.sent (the Add Course(s) click)', () => {
  assert.equal(reachable(M.jobStates('register'), 'lookup.search').has('submit.sent'), true);
  assert.equal(reachable(M.jobStates('fill'), 'lookup.search').has('submit.sent'), false);
  assert.equal(reachable(M.jobStates('lookup'), 'lookup.search').has('submit.sent'), false);
  assert.equal(reachable(M.jobStates('lookupStay'), 'lookup.search').has('submit.sent'), false);
});

test('an unknown mode gets the lookup table, which cannot register', () => {
  assert.deepEqual(M.jobStates('whatever'), M.jobStates('lookup'));
  assert.deepEqual(M.jobStates(undefined), M.jobStates('lookup'));
});

test('done states are final and every working state can be stopped, failed or abandoned', () => {
  for (const mode of M.JOB_MODES) {
    const table = M.jobStates(mode);
    for (const [state, moves] of Object.entries(table)) {
      if (state.startsWith('done.')) assert.deepEqual(moves, {}, state);
      else for (const [ev, to] of Object.entries(END)) assert.equal(moves[ev], to, `${mode} ${state} ${ev}`);
    }
  }
});

test('jobActive', () => {
  assert.equal(M.jobActive(null), false);
  assert.equal(M.jobActive({}), false);
  assert.equal(M.jobActive({ state: 'lookup.search' }), true);
  assert.equal(M.jobActive({ state: 'submit.sent' }), true);
  for (const d of DONE) assert.equal(M.jobActive({ state: d }), false, d);
});

// ---------- old-shape jobs (v1.2.0 and earlier) ----------
const old = (over) => ({ user: 'Ada Lovelace', term: '2026;30', queue: ['COMP 220 A', 'STAT 131 B'], refs: { 'COMP 220 A': '12345' }, results: {}, phase: 'lookup', step: null, batch: [], guard: 3, ts: 1000, dryRun: false, fillOnly: false, lookupOnly: false, stayOnDetails: false, ...over });

test('upgradeJob maps phase and step to state', () => {
  const cases = [
    [{ phase: 'lookup', step: null }, 'lookup.search'],
    [{ phase: 'lookup', step: 'searched' }, 'lookup.results'],
    [{ phase: 'lookup', step: 'details' }, 'lookup.details'],
    [{ phase: 'submit', step: null }, 'submit.fill'],
    [{ phase: 'submit', step: 'term' }, 'submit.term'],
    [{ phase: 'submit', step: 'submitted' }, 'submit.sent'],
    [{ phase: 'submit', step: 'verify' }, 'submit.verify'],
    [{ phase: 'done', step: null }, 'done.ok'],
  ];
  for (const [over, state] of cases) assert.equal(M.upgradeJob(old(over)).state, state, JSON.stringify(over));
});

test('upgradeJob maps the booleans to mode', () => {
  assert.equal(M.upgradeJob(old({})).mode, 'register');
  assert.equal(M.upgradeJob(old({ fillOnly: true })).mode, 'fill');
  assert.equal(M.upgradeJob(old({ lookupOnly: true })).mode, 'lookup');
  assert.equal(M.upgradeJob(old({ lookupOnly: true, stayOnDetails: true })).mode, 'lookupStay');
});

test('upgradeJob keeps every other field and drops only the old ones', () => {
  const src = old({ phase: 'submit', step: 'submitted', batch: ['COMP 220 A'], msgs: ['x'], current: 'COMP 220 A', tries: 1, dryRun: true, manualRefs: '12345', filled: 1, remaining: 0, dryNote: 'n' });
  const job = M.upgradeJob(src);
  for (const k of ['user', 'term', 'queue', 'refs', 'results', 'batch', 'guard', 'ts', 'dryRun', 'msgs', 'current', 'tries', 'manualRefs', 'filled', 'remaining', 'dryNote']) assert.deepEqual(job[k], src[k], k);
  for (const k of ['phase', 'step', 'fillOnly', 'lookupOnly', 'stayOnDetails']) assert.equal(k in job, false, k);
  assert.equal(src.phase, 'submit'); // the stored object is not changed in place
});

test('upgradeJob: an old lookup that had reached "submit" ends instead of registering', () => {
  const job = M.upgradeJob(old({ lookupOnly: true, phase: 'submit', step: 'submitted' }));
  assert.equal(job.state, 'done.ok');
  assert.equal(job.mode, 'lookup');
});

test('upgradeJob: an old job that stopped itself becomes done.stopped', () => {
  const job = M.upgradeJob(old({ phase: 'done', results: { 'STAT 131 B': { ok: false, msg: 'Stopped: myGCC did not respond as expected.' } } }));
  assert.equal(job.state, 'done.stopped');
});

test('upgradeJob: every converted state exists in its mode table', () => {
  for (const phase of ['lookup', 'submit', 'done']) for (const step of [null, 'searched', 'details', 'term', 'submitted', 'verify']) {
    for (const flags of [{}, { fillOnly: true }, { lookupOnly: true }, { lookupOnly: true, stayOnDetails: true }]) {
      const job = M.upgradeJob(old({ phase, step, ...flags }));
      assert.ok(M.jobStates(job.mode)[job.state], `${phase}/${step}/${JSON.stringify(flags)} -> ${job.mode} ${job.state}`);
    }
  }
});

test('upgradeJob leaves new-shape jobs and empty values alone', () => {
  const now = { user: 'A', state: 'submit.fill', mode: 'fill', queue: [] };
  assert.equal(M.upgradeJob(now), now);
  assert.equal(M.upgradeJob(null), null);
  assert.equal(M.upgradeJob(undefined), undefined);
});

// ---------- per-course outcome for the abandoned summary ----------
test('jobCourse says what happened to each course', () => {
  const job = {
    queue: ['A 1 A', 'B 2 A', 'C 3 A', 'D 4 A', 'E 5 A'], leftIn: 'submit.sent', batch: ['C 3 A'],
    refs: { 'A 1 A': '111', 'B 2 A': '222', 'C 3 A': '333', 'D 4 A': '444' },
    results: { 'A 1 A': { ok: true }, 'B 2 A': { ok: false, msg: 'Section is full' } },
  };
  assert.deepEqual(M.jobCourse(job, 'A 1 A'), { kind: 'added', ref: '111' });
  assert.deepEqual(M.jobCourse(job, 'B 2 A'), { kind: 'notAdded', ref: '222', msg: 'Section is full' });
  assert.deepEqual(M.jobCourse(job, 'C 3 A'), { kind: 'unconfirmed', ref: '333' }); // sent, never verified
  assert.deepEqual(M.jobCourse(job, 'D 4 A'), { kind: 'refOnly', ref: '444' });
  assert.deepEqual(M.jobCourse(job, 'E 5 A'), { kind: 'none', ref: '' });
});

test('jobCourse: a batch that was only filled (not sent) is reference-number-only', () => {
  const job = { queue: ['C 3 A'], leftIn: 'submit.fill', batch: ['C 3 A'], refs: { 'C 3 A': '333' }, results: {} };
  assert.equal(M.jobCourse(job, 'C 3 A').kind, 'refOnly');
});
