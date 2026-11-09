// aBetterMyGCC state tables. Pure data and pure functions only (no DOM, no chrome), so the
// same file runs in the page, on the Settings page and under `node --test`.
// Each table is what GCCX.machine (lib.js) is driven with: state -> { EVENT: 'next state' }.
// Diagrams and storage keys: docs/STATE_MACHINES.md. Loaded right after lib.js.
(function (root) {
  'use strict';
  const X = root.GCCX || (root.GCCX = {});

  // ---------- batch registration job (builder.js, chrome.storage.local "job") ----------
  // job.mode says what the job may do; job.state says where it is.
  //   register    look up reference numbers, fill the Add by Reference # boxes, press Add Course(s)
  //   fill        look up, fill the boxes, stop (the student presses Add Course(s))
  //   lookup      look up reference numbers only
  //   lookupStay  look up one course and stay on its details page ("Get course number")
  // The lookup modes have no submit.* states at all, and only `register` has the SEND move,
  // so a lookup or a fill can never reach the step that presses myGCC's Add button.
  const JOB_MODES = ['register', 'fill', 'lookup', 'lookupStay'];
  const JOB_END = { STOP: 'done.stopped', FAIL: 'done.failed', ABANDON: 'done.abandoned' };
  function jobStates(mode) {
    if (!JOB_MODES.includes(mode)) mode = 'lookup'; // unknown mode: the table that cannot register
    const lookupOnly = mode === 'lookup' || mode === 'lookupStay';
    const t = {
      // on Add/Drop, about to search for the next course without a reference number
      'lookup.search': { SEARCH: 'lookup.results', SKIP: 'lookup.search', REFS_DONE: lookupOnly ? 'done.ok' : 'submit.fill', ...JOB_END },
      // search submitted; the results screen is expected next
      'lookup.results': { OPEN: 'lookup.details', MISSING: 'lookup.search', LOST: 'lookup.search', ...JOB_END },
      // course link opened; the details screen (with the reference number) is expected next
      'lookup.details': { REF: 'lookup.search', LOST: 'lookup.search', ...(mode === 'lookupStay' ? { REFS_DONE: 'done.ok' } : {}), ...JOB_END },
      'done.ok': {}, 'done.stopped': {}, 'done.abandoned': {}, 'done.failed': {},
    };
    if (!lookupOnly) {
      // on Add/Drop, about to fill the six reference boxes
      t['submit.fill'] = { TERM: 'submit.term', FILLED: 'done.ok', NOTHING: 'done.ok', ...(mode === 'register' ? { SEND: 'submit.sent' } : {}), ...JOB_END };
      // Your Schedule term switched; the page is reloading on the plan's term
      t['submit.term'] = { SWITCHED: 'submit.fill', LOST: 'submit.fill', ...JOB_END };
      // Add Course(s) pressed; the result page is expected next
      t['submit.sent'] = { OFFPAGE: 'submit.verify', JUDGED: 'submit.fill', ...JOB_END };
      // the result came back on another screen; going to Add/Drop to check Your Schedule
      t['submit.verify'] = { JUDGED: 'submit.fill', LOST: 'submit.fill', ...JOB_END };
    }
    return t;
  }
  const jobActive = (job) => !!job && typeof job.state === 'string' && !job.state.startsWith('done.');

  // Jobs saved by v1.2.0 and earlier used phase / step plus three booleans. Convert as they are
  // read; the new shape is written back by the next saveJob. Everything else on the job is kept.
  function upgradeJob(job) {
    if (!job || typeof job !== 'object' || typeof job.state === 'string') return job;
    const { phase, step, fillOnly, lookupOnly, stayOnDetails, ...rest } = job;
    const mode = lookupOnly ? (stayOnDetails ? 'lookupStay' : 'lookup') : fillOnly ? 'fill' : 'register';
    let state;
    if (phase === 'done') {
      const stopped = Object.values(job.results || {}).some((r) => r && !r.ok && /^Stopped:/.test(r.msg || ''));
      state = stopped ? 'done.stopped' : 'done.ok';
    } else if (phase === 'submit') {
      // the old code ended a lookup that reached "submit" without registering; so does this
      state = lookupOnly ? 'done.ok' : ({ term: 'submit.term', submitted: 'submit.sent', verify: 'submit.verify' }[step] || 'submit.fill');
    } else {
      state = { searched: 'lookup.results', details: 'lookup.details' }[step] || 'lookup.search';
    }
    return { ...rest, state, mode };
  }

  // What happened to one course of a job, for the summary shown when a job ends early.
  //   added        myGCC lists it under Your Schedule
  //   notAdded     myGCC (or the job) said no; msg has the reason
  //   unconfirmed  it was in the batch sent to myGCC when the job was left: it may have been added
  //   refOnly      its reference number was found, nothing was sent
  //   none         not even looked up
  function jobCourse(job, code) {
    const r = (job.results || {})[code];
    const ref = (job.refs || {})[code] || '';
    if (r && r.ok) return { kind: 'added', ref };
    if (r) return { kind: 'notAdded', ref, msg: r.msg || '' };
    const sent = /^submit\.(sent|verify)$/.test(job.leftIn || '') && (job.batch || []).includes(code);
    if (sent) return { kind: 'unconfirmed', ref };
    return { kind: ref ? 'refOnly' : 'none', ref };
  }

  // ---------- AI key setup (options/options.js; the background reports the same states) ----------
  //   none              no key saved
  //   verifying         asking Chrome for access, then checking the key (Settings page only)
  //   needs-permission  key saved, Chrome's access to the AI service denied or switched off
  //   invalid           the service rejected the key, or no models came back (Settings page only)
  //   needs-model       key and access fine, no model chosen
  //   ready
  const aiSetup = {
    none: { SAVE: 'verifying', CLEAR: 'none' },
    verifying: { DENIED: 'needs-permission', REJECTED: 'invalid', VERIFIED: 'ready', CLEAR: 'none' },
    'needs-permission': { SAVE: 'verifying', ALLOW: 'verifying', CLEAR: 'none' },
    invalid: { SAVE: 'verifying', CLEAR: 'none' },
    'needs-model': { SAVE: 'verifying', PICK: 'ready', REVOKED: 'needs-permission', CLEAR: 'none' },
    ready: { SAVE: 'verifying', PICK: 'ready', REVOKED: 'needs-permission', CLEAR: 'none' },
  };
  // what src/background.js aiState() can answer
  const AI_BACKGROUND_STATES = ['none', 'needs-permission', 'needs-model', 'ready'];

  // ---------- dashboard data (content.js): one of these per data source ----------
  //   loading  being fetched
  //   ready    fresh data (or a saved copy still within its time limit)
  //   empty    myGCC answered and there is nothing to show (no classes, registration not open...)
  //   stale    the refresh failed, so a saved copy is shown, with a note saying how old it is
  //   error    the refresh failed and there is no saved copy
  // ARRIVED: data that turns up outside the loader (chapel numbers come from a frame, via storage).
  const CARDS = ['schedule', 'degree', 'standing', 'registration', 'chapel', 'balance', 'menu'];
  const card = {
    loading: { LOADED: 'ready', EMPTY: 'empty', STALE: 'stale', FAILED: 'error', ARRIVED: 'ready' },
    ready: { REFRESH: 'loading' },
    empty: { REFRESH: 'loading', ARRIVED: 'ready' },
    stale: { REFRESH: 'loading', ARRIVED: 'ready' },
    error: { REFRESH: 'loading', ARRIVED: 'ready' },
  };
  // Which move a finished load makes. info is cached.info[key] from content.js:
  // { stale, ts } = fell back to the saved copy; { failed } = failed with nothing saved.
  function cardEvent(key, data, info) {
    info = info || {};
    const has = key === 'menu' ? !!data && (!!data.closed || (data.stations || []).length > 0)
      : data != null && !(Array.isArray(data) && !data.length);
    if (has) return info.stale ? 'STALE' : 'LOADED';
    if (key === 'menu' && !data) return 'FAILED'; // the background answers null when the menu request failed
    return info.failed ? 'FAILED' : 'EMPTY';
  }
  // One status for a card drawn from several sources, and for the footer.
  function cardsStatus(list) {
    if (list.includes('loading')) return 'loading';
    if (list.includes('stale')) return 'stale';
    if (list.includes('ready')) return 'ready';
    if (list.includes('error')) return 'error';
    return 'empty';
  }
  const cardsFooter = (list) => (list.includes('loading') ? 'loading' : list.some((s) => s === 'stale' || s === 'error') ? 'problem' : 'ok');
  // "2 h ago" for the stale note
  function ago(ts, now) {
    const min = Math.max(0, Math.round(((now || Date.now()) - ts) / 60000));
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  X.machines = { JOB_MODES, jobStates, jobActive, upgradeJob, jobCourse, aiSetup, AI_BACKGROUND_STATES, CARDS, card, cardEvent, cardsStatus, cardsFooter, ago };
})(typeof window !== 'undefined' ? window : globalThis);
