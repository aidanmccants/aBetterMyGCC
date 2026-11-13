#!/usr/bin/env node
// Repository checks that `npm test` does not cover. Node built-ins only.
// Run with `npm run check`. Exits non-zero and lists every problem found.
//
//  1. Syntax: `node --check` on every .js file in the extension, demo, scripts and tests.
//  2. manifest.json: parses, is MV3, and every file it names exists (plus the background
//     worker's importScripts and the local src/href of every extension HTML page).
//  3. Script lists (AGENTS.md "Script lists must match"):
//     - demo/index.html loads the myGCC content scripts and styles in manifest order,
//     - demo/chapel.html loads the chapel content scripts in manifest order,
//     - FILES in src/devreload.js lists every file the manifest loads and every
//       .js/.css/.html file of the extension, and nothing that does not exist.
//  4. DEFAULTS is identical in its four copies (AGENTS.md "DEFAULTS is duplicated").
//  5. package.json and manifest.json have the same version.
//  6. themes/index.json and each listed theme.json parse.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p)) && fs.statSync(abs(p)).isFile();
const read = (p) => fs.readFileSync(abs(p), 'utf8');

function readJSON(p) {
  try { return JSON.parse(read(p)); } catch (e) { fail(`${p}: does not parse as JSON (${e.message})`); return null; }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function listDiff(label, expected, actual) {
  if (sameList(expected, actual)) return;
  const missing = expected.filter((x) => !actual.includes(x));
  const extra = actual.filter((x) => !expected.includes(x));
  let msg = `${label} does not match manifest.json`;
  if (missing.length) msg += `\n    missing: ${missing.join(', ')}`;
  if (extra.length) msg += `\n    not in manifest: ${extra.join(', ')}`;
  if (!missing.length && !extra.length) {
    msg += `\n    same files, different order\n    manifest: ${expected.join(', ')}\n    found:    ${actual.join(', ')}`;
  }
  fail(msg);
}

// ---- 1. syntax ----------------------------------------------------------------------
const SYNTAX_DIRS = ['src', 'options', 'popup', 'logs', 'demo', 'scripts', 'tests'];
const jsFiles = SYNTAX_DIRS.flatMap((d) => walk(abs(d))).filter((f) => /\.(c|m)?js$/.test(f)).sort();
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${rel(f)}: syntax error\n    ${(r.stderr || '').trim().split('\n').join('\n    ')}`);
}

// ---- 2. manifest --------------------------------------------------------------------
const manifest = readJSON('manifest.json') || {};
if (manifest.manifest_version !== 3) fail(`manifest.json: manifest_version is ${manifest.manifest_version}, expected 3`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) fail(`manifest.json: version "${manifest.version}" is not x.y.z`);

const manifestFiles = new Set(); // every file the manifest names
const need = (p, where) => {
  if (typeof p !== 'string') return;
  manifestFiles.add(p);
  if (!exists(p)) fail(`manifest.json ${where}: "${p}" does not exist`);
};
for (const [size, p] of Object.entries(manifest.icons || {})) need(p, `icons.${size}`);
if (manifest.action) {
  need(manifest.action.default_popup, 'action.default_popup');
  const di = manifest.action.default_icon;
  if (typeof di === 'string') need(di, 'action.default_icon');
  else for (const [size, p] of Object.entries(di || {})) need(p, `action.default_icon.${size}`);
}
if (manifest.options_ui) need(manifest.options_ui.page, 'options_ui.page');
if (manifest.options_page) need(manifest.options_page, 'options_page');
if (manifest.background) need(manifest.background.service_worker, 'background.service_worker');
(manifest.content_scripts || []).forEach((cs, i) => {
  for (const p of cs.js || []) need(p, `content_scripts[${i}].js`);
  for (const p of cs.css || []) need(p, `content_scripts[${i}].css`);
});
for (const [i, war] of (manifest.web_accessible_resources || []).entries()) {
  for (const p of war.resources || []) if (!/[*]/.test(p)) need(p, `web_accessible_resources[${i}]`);
}

// importScripts() in the background worker, relative to the worker's folder.
const bg = manifest.background && manifest.background.service_worker;
if (bg && exists(bg)) {
  const src = read(bg);
  for (const m of src.matchAll(/importScripts\(([^)]*)\)/g)) {
    for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
      const p = path.posix.join(path.posix.dirname(bg), s[1]);
      manifestFiles.add(p);
      if (!exists(p)) fail(`${bg}: importScripts("${s[1]}") -> ${p} does not exist`);
    }
  }
}

// Local <script src> and <link href> in the extension's HTML pages.
function htmlRefs(file, tagRe) {
  const out = [];
  const dir = path.posix.dirname(file);
  for (const m of read(file).replace(/<!--[\s\S]*?-->/g, '').matchAll(tagRe)) {
    const url = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue; // http:, data:, chrome-extension:, anchors
    out.push(path.posix.normalize(path.posix.join(dir, url.split(/[?#]/)[0])));
  }
  return out;
}
const SCRIPT_RE = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
const STYLE_RE = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi;
const htmlPages = ['src', 'options', 'popup', 'logs', 'demo']
  .flatMap((d) => walk(abs(d))).filter((f) => f.endsWith('.html')).map(rel).sort();
for (const page of htmlPages) {
  for (const p of [...htmlRefs(page, SCRIPT_RE), ...htmlRefs(page, STYLE_RE)]) {
    if (!exists(p)) fail(`${page}: references ${p}, which does not exist`);
  }
}

// ---- 3. script lists ----------------------------------------------------------------
const csFor = (needle) => (manifest.content_scripts || []).find((cs) => (cs.matches || []).some((m) => m.includes(needle)));
const onlySrc = (list) => list.filter((p) => p.startsWith('src/'));

const ics = csFor('my.gcc.edu/ICS');
if (!ics) fail('manifest.json: no content_scripts entry matches my.gcc.edu/ICS');
else if (exists('demo/index.html')) {
  listDiff('demo/index.html <script> list (src/ only)', ics.js || [], onlySrc(htmlRefs('demo/index.html', SCRIPT_RE)));
  listDiff('demo/index.html stylesheet list (src/ only)', ics.css || [], onlySrc(htmlRefs('demo/index.html', STYLE_RE)));
} else fail('demo/index.html does not exist');

const chapel = csFor('chapel.aspx');
if (chapel && exists('demo/chapel.html')) {
  listDiff('demo/chapel.html <script> list (src/ only)', chapel.js || [], onlySrc(htmlRefs('demo/chapel.html', SCRIPT_RE)));
}

// FILES in src/devreload.js: the dev auto-reload watch list.
if (exists('src/devreload.js')) {
  const m = read('src/devreload.js').match(/const\s+FILES\s*=\s*\[([\s\S]*?)\];/);
  if (!m) fail('src/devreload.js: could not find `const FILES = [ ... ];`');
  else {
    const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    const dupes = files.filter((f, i) => files.indexOf(f) !== i);
    if (dupes.length) fail(`src/devreload.js FILES: listed twice: ${[...new Set(dupes)].join(', ')}`);
    const gone = files.filter((f) => !exists(f));
    if (gone.length) fail(`src/devreload.js FILES: these do not exist: ${gone.join(', ')}`);
    const extensionFiles = ['src', 'options', 'popup', 'logs', 'demo']
      .flatMap((d) => walk(abs(d))).map(rel).filter((f) => /\.(js|css|html)$/.test(f));
    const wanted = [...new Set(['manifest.json', ...manifestFiles, ...extensionFiles])]
      .filter((f) => /\.(js|css|html|json)$/.test(f)).sort();
    const missing = wanted.filter((f) => !files.includes(f));
    if (missing.length) fail(`src/devreload.js FILES: missing (edits to these will not auto-reload): ${missing.join(', ')}`);
  }
} else fail('src/devreload.js does not exist');

// ---- 4. DEFAULTS --------------------------------------------------------------------
const DEFAULTS_FILES = ['src/content.js', 'src/onboarding.js', 'options/options.js', 'popup/popup.js'];

// Finds `const DEFAULTS = { ... }` and returns the object literal's text, matching
// braces and skipping over strings, so nested objects and '}' inside strings are fine.
function extractDefaults(src) {
  const m = /\bconst\s+DEFAULTS\s*=\s*\{/.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

// Stable JSON with sorted keys, so key order does not matter.
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

const defaults = [];
for (const f of DEFAULTS_FILES) {
  if (!exists(f)) { fail(`${f} does not exist (expected a DEFAULTS copy)`); continue; }
  const text = extractDefaults(read(f));
  if (!text) { fail(`${f}: could not find \`const DEFAULTS = { ... }\``); continue; }
  let value;
  try {
    // A plain object literal of our own; evaluated in an empty context with no globals.
    value = vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
  } catch (e) {
    fail(`${f}: DEFAULTS is not a plain literal (${e.message}); keep it to strings, numbers, booleans`);
    continue;
  }
  defaults.push({ f, value, c: canon(value) });
}
if (defaults.length > 1) {
  const base = defaults[0];
  for (const d of defaults.slice(1)) {
    if (d.c === base.c) continue;
    const keys = new Set([...Object.keys(base.value), ...Object.keys(d.value)]);
    const diffs = [...keys].filter((k) => canon(base.value[k]) !== canon(d.value[k]))
      .map((k) => `${k}: ${base.f}=${JSON.stringify(base.value[k])} vs ${d.f}=${JSON.stringify(d.value[k])}`);
    fail(`DEFAULTS differ between ${base.f} and ${d.f} (change all four together)\n    ${diffs.join('\n    ')}`);
  }
}

// ---- 5. versions --------------------------------------------------------------------
const pkg = readJSON('package.json') || {};
if (pkg.version !== manifest.version) {
  fail(`package.json version "${pkg.version}" does not match manifest.json version "${manifest.version}"`);
}

// ---- 6. themes ----------------------------------------------------------------------
if (exists('themes/index.json')) {
  const idx = readJSON('themes/index.json');
  for (const t of (idx && idx.themes) || []) {
    if (!exists(`themes/${t}/theme.json`)) fail(`themes/index.json lists "${t}" but themes/${t}/theme.json does not exist`);
    else readJSON(`themes/${t}/theme.json`);
  }
}

// ---- report -------------------------------------------------------------------------
if (errors.length) {
  console.error(`check: ${errors.length} problem${errors.length === 1 ? '' : 's'} found\n`);
  for (const e of errors) console.error(`  x ${e}\n`);
  process.exit(1);
}
console.log(`check: ok (${jsFiles.length} JS files parsed, manifest ${manifest.version}, script lists, DEFAULTS x${defaults.length}, versions)`);
