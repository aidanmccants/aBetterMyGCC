// `node --test tests/` on Node 22+ runs this directory as one module (older Node finds the
// *.test.js files itself and never loads this file), so pull every test file in from here.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
for (const f of fs.readdirSync(__dirname).sort()) if (f.endsWith('.test.js')) require(path.join(__dirname, f));
