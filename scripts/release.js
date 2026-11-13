#!/usr/bin/env node
// Cuts a release. Node built-ins plus git and the system `zip` command.
//
//   npm run release -- <patch|minor|major|x.y.z> [--dry-run]
//
// 1. refuses if the git working tree has uncommitted changes
// 2. runs `npm test` and `npm run check`, and stops if either fails
// 3. sets the new version in manifest.json and package.json (only the version string
//    changes; the rest of each file is left as it was)
// 4. builds dist/abettermygcc-<version>.zip (scripts/pack.js)
// 5. commits "Release vX.Y.Z" and makes an annotated tag vX.Y.Z
// It never pushes; it prints the push command. --dry-run runs the checks and prints
// what would happen, without writing, committing or tagging anything.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pack, packFiles, zipName, hasZip } = require('./pack.js');

const ROOT = path.join(__dirname, '..');
const VERSION_FILES = ['manifest.json', 'package.json'];
const VERSION_RE = /("version"\s*:\s*")([^"]*)(")/;

function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
  if (r.error) die(`git ${args[0]} failed: ${r.error.message}`);
  return r;
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const win = process.platform === 'win32';
  const r = spawnSync(win ? `${cmd}.cmd` : cmd, args, { cwd: ROOT, stdio: 'inherit', shell: win });
  if (r.error) die(`could not run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) die(`\`${cmd} ${args.join(' ')}\` failed; nothing was changed`);
}

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v || '');
  return m ? m.slice(1).map(Number) : null;
}

function bump(current, kind) {
  const c = parseVersion(current);
  if (!c) die(`manifest.json version "${current}" is not x.y.z`);
  if (kind === 'major') return `${c[0] + 1}.0.0`;
  if (kind === 'minor') return `${c[0]}.${c[1] + 1}.0`;
  if (kind === 'patch') return `${c[0]}.${c[1]}.${c[2] + 1}`;
  const n = parseVersion(kind);
  if (!n) die(`"${kind}" is not patch, minor, major or a version like 1.2.3`);
  const newer = n[0] - c[0] || n[1] - c[1] || n[2] - c[2];
  if (newer <= 0) die(`${kind} is not newer than the current version ${current}`);
  return kind;
}

// ---- arguments ----
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const unknown = args.filter((a) => a.startsWith('--') && a !== '--dry-run');
if (unknown.length) die(`unknown option ${unknown.join(', ')}`);
if (positional.length !== 1) die('usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const current = JSON.parse(read('manifest.json')).version;
const pkgVersion = JSON.parse(read('package.json')).version;
if (pkgVersion !== current) die(`package.json version ${pkgVersion} does not match manifest.json ${current}; fix that first`);
const next = bump(current, positional[0]);
const tag = `v${next}`;

// ---- preconditions ----
const status = git(['status', '--porcelain']);
if (status.status !== 0) die('not a git repository');
if (status.stdout.trim()) die(`the working tree has uncommitted changes; commit or stash them first:\n${status.stdout}`);
if (git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status === 0) die(`tag ${tag} already exists`);
if (!hasZip()) die('the `zip` command was not found. Install it (e.g. `apt-get install zip`, `brew install zip`) and try again.');

console.log(`Release ${current} -> ${next}${dryRun ? ' (dry run)' : ''}`);

// ---- tests and checks ----
run('npm', ['test']);
run('npm', ['run', 'check']);

// ---- version bump (string edit in place, formatting kept) ----
const edits = VERSION_FILES.map((f) => {
  const text = read(f);
  const m = VERSION_RE.exec(text);
  if (!m) die(`${f}: no "version" field found`);
  if (m[2] !== current) die(`${f}: first "version" is "${m[2]}", expected "${current}"`);
  return { f, text: text.replace(VERSION_RE, `$1${next}$3`) };
});

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
const pushCmd = `git push origin ${branch} && git push origin ${tag}`;

if (dryRun) {
  const files = packFiles();
  console.log(`\nDry run: nothing was written. It would:`);
  for (const e of edits) console.log(`  - set "version" to "${next}" in ${e.f}`);
  console.log(`  - build dist/${zipName(next)} with ${files.length} files from: ${[...new Set(files.map((f) => f.split('/')[0]))].join(', ')}`);
  console.log(`  - commit "Release ${tag}" (manifest.json, package.json) on ${branch}`);
  console.log(`  - create annotated tag ${tag}`);
  console.log(`  - then you would push with: ${pushCmd}`);
  process.exit(0);
}

for (const e of edits) fs.writeFileSync(path.join(ROOT, e.f), e.text);
console.log(`\nSet version ${next} in ${VERSION_FILES.join(' and ')}`);

let packed;
try {
  packed = pack(next);
} catch (e) {
  die(`${e.message}\nThe version was bumped but nothing was committed; undo with: git checkout -- ${VERSION_FILES.join(' ')}`);
}
console.log(`Packed ${packed.files.length} files into ${path.relative(ROOT, packed.out)}`);

const add = git(['add', '--', ...VERSION_FILES]);
if (add.status !== 0) die(`git add failed: ${add.stderr.trim()}`);
const commit = git(['commit', '-m', `Release ${tag}`], { stdio: 'inherit' });
if (commit.status !== 0) die('git commit failed');
const tagged = git(['tag', '-a', tag, '-m', `Release ${tag}`], { stdio: 'inherit' });
if (tagged.status !== 0) die(`git tag failed (the release commit was made; tag it with: git tag -a ${tag} -m "Release ${tag}")`);

console.log(`\nReleased ${tag}: committed and tagged locally, not pushed.`);
console.log(`Push it (the tag starts the GitHub release workflow):\n  ${pushCmd}`);
