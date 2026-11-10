// The AI key sits in chrome.storage.local under "ai", an area Chrome lets content scripts read.
// The rule that keeps it away from myGCC pages is ours, so check it: no content script (and no
// demo script) may read the "ai" record or mention a key. Only background.js / ai.js (the
// service worker) and the Settings page may.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const contentScripts = [...new Set(manifest.content_scripts.flatMap((c) => c.js))];
const READS_AI = [
  /storage\.local\.get\(\s*['"`]ai['"`]/, // chrome.storage.local.get('ai', ...)
  /storage\.local\.get\(\s*\[[^\]]*['"`]ai['"`]/, // ...get(['ai', ...])
  /store\.get\(\s*['"`]ai['"`]/, // the store helper in content.js / builder.js
  /\bai\.key\b/,
  /\.ai\.newValue\b/, // the changed record carries the key too
];

test('manifest content scripts exist and include the page scripts', () => {
  assert.ok(contentScripts.includes('src/content.js') && contentScripts.includes('src/builder.js') && contentScripts.includes('src/lib.js'));
  for (const f of contentScripts) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('no content script reads the stored AI record or key', () => {
  for (const f of contentScripts) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const re of READS_AI) assert.equal(re.test(src), false, `${f} matches ${re}`);
  }
});

test('the service worker is the reader, and never logs the key', () => {
  const bg = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  assert.match(bg, /storage\.local\.get\('ai'\)/);
  for (const line of bg.split('\n').filter((l) => /emitLog\(/.test(l))) assert.equal(/\bkey\b/.test(line.replace(/'[^']*'|`[^`]*`/g, '')), false, line.trim().slice(0, 120));
});
