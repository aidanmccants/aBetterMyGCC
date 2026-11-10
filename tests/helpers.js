// Loads the extension's plain browser scripts in Node for tests. The scripts are IIFEs that
// attach to window.GCCX (or globalThis when there is no window), so they are run as-is:
// nothing in src/ changes to make it testable.
'use strict';
const path = require('node:path');

const logs = []; // every GCCX.log call: { level, source, message, data }

// The few browser globals the scripts read at call time. No `window` and no `document`:
// lib.js then skips its page-only listeners and takes its globalThis fallback.
globalThis.chrome = {
  runtime: {
    id: 'test',
    lastError: null,
    sendMessage(msg, cb) { if (msg && msg.type === 'log') logs.push(msg); if (cb) cb(); },
  },
};
globalThis.location = new URL('https://my.gcc.edu/ICS/');

function load(...files) {
  for (const f of files) require(path.join(__dirname, '..', 'src', f));
  return globalThis.GCCX;
}

module.exports = { load, logs };
