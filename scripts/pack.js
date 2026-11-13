#!/usr/bin/env node
// Builds the extension zip: dist/abettermygcc-<version>.zip, with only the files the
// extension loads. Node built-ins plus the system `zip` command.
//
//   node scripts/pack.js            build the zip for the version in manifest.json
//   node scripts/pack.js --list     print the files that would go in, write nothing
//
// Used by scripts/release.js and .github/workflows/release.yml.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// What the extension needs at runtime. demo/ is included because Settings > Help opens
// demo/index.html; themes/ is read by src/theme-engine/loader.js.
const INCLUDE = ['manifest.json', 'src', 'options', 'popup', 'logs', 'icons', 'themes', 'demo'];
// Notes for developers inside those folders (e.g. demo/HANDOFF.md) stay out.
const EXCLUDE = [/\.md$/i];

function zipName(version) { return `abettermygcc-${version}.zip`; }

// Tracked files only, so stray local files never ship.
function packFiles() {
  const r = spawnSync('git', ['ls-files', '-z', '--', ...INCLUDE], { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(`git ls-files failed: ${r.error ? r.error.message : r.stderr.trim()}`);
  }
  const files = r.stdout.split('\0').filter(Boolean).filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();
  if (!files.includes('manifest.json')) throw new Error('manifest.json is not tracked by git');
  const gone = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (gone.length) throw new Error(`tracked files missing from the working tree: ${gone.join(', ')}`);
  return files;
}

function hasZip() {
  const r = spawnSync('zip', ['-v'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// Writes dist/abettermygcc-<version>.zip and returns its path.
function pack(version) {
  if (!hasZip()) {
    throw new Error('the `zip` command was not found. Install it (e.g. `apt-get install zip`, `brew install zip`) and try again.');
  }
  const files = packFiles();
  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, zipName(version));
  fs.rmSync(out, { force: true }); // zip adds to an existing archive otherwise
  // -X: no extra file attributes; -D: no directory entries; -@: names from stdin.
  const r = spawnSync('zip', ['-q', '-X', '-D', out, '-@'], { cwd: ROOT, input: files.join('\n') + '\n', encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`zip failed: ${r.error ? r.error.message : r.stderr.trim()}`);
  return { out, files };
}

function manifestVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
}

module.exports = { pack, packFiles, zipName, hasZip, manifestVersion };

if (require.main === module) {
  try {
    const version = manifestVersion();
    if (process.argv.includes('--list')) {
      const files = packFiles();
      for (const f of files) console.log(f);
      console.log(`\n${files.length} files would go in dist/${zipName(version)}`);
    } else {
      const { out, files } = pack(version);
      console.log(`Packed ${files.length} files into ${path.relative(ROOT, out)} (${fs.statSync(out).size} bytes)`);
    }
  } catch (e) {
    console.error(`pack: ${e.message}`);
    process.exit(1);
  }
}
