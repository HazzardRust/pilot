/**
 * S6 of suite-at-landing: `pilot integrate` (a slice, the base) and `pilot sync` run
 * the repository's selected command since the tip before their merge, and a merge into pilot
 * given no `since` (land's feature merge) runs the full command (spec 3; L4, L6, L8). Every case
 * runs against a scratch bare origin whose package.json has a `test` and a `test:changed` that
 * echo their argv to the file `S6_ARGV` names; nothing reaches GitHub or a deck.
 */

// A red run's log goes under a home of this process's own, never the real one; the
// fixture seam imports fake-home.mjs first.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { mergeIntoPilot, sync } = await import('../sync.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Appends `<which> <argv...> slot=<PILOT_GATE_SLOT or ->` to S6_ARGV, prints a scope line when selecting, and node --test's summary. */
const ECHO = [
  "import fs from 'node:fs';",
  "const args = process.argv.slice(2);",
  "fs.appendFileSync(process.env.S6_ARGV, `${args.join(' ')} slot=${process.env.PILOT_GATE_SLOT ?? '-'}\\n`);",
  "const since = args.find((arg) => arg.startsWith('--since='));",
  "if (since) console.log(`selected 1 of 2 test files since ${since.slice('--since='.length, '--since='.length + 7)}`);",
  "console.log('ℹ pass 1');",
  "console.log('ℹ fail 0');",
  '',
].join('\n');

const PACKAGE = `${JSON.stringify({ name: 's6', private: true, scripts: { test: 'node echo.mjs full', 'test:changed': 'node echo.mjs changed' } }, null, 2)}\n`;
const LOCK = `${JSON.stringify({ name: 's6', lockfileVersion: 3, requires: true, packages: { '': { name: 's6' } } }, null, 2)}\n`;

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/**
 * origin.git: main holds package.json, its lock and echo.mjs; pilot is main plus one commit;
 * feat/x is cut from main with one commit; slice/a adds a.txt to feat/x; then main moves by one
 * commit. The clone is on feat/x with origin/HEAD naming main.
 */
function repos(t) {
  return gitFixture(t, 'integrate-select:repos', buildRepos);
}

function buildRepos(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'package.json'), PACKAGE);
  fs.writeFileSync(path.join(work, 'package-lock.json'), LOCK);
  fs.writeFileSync(path.join(work, 'echo.mjs'), ECHO);
  git(work, 'add', 'package.json', 'package-lock.json', 'echo.mjs');
  git(work, 'commit', '-q', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'pilot');
  commitFile(work, 'pilot.txt', 'pilot\n', 'pilot only');
  git(work, 'push', '-q', 'origin', 'pilot');
  git(work, 'checkout', '-q', '-b', 'feat/x', 'main');
  commitFile(work, 'feat.txt', 'feat\n', 'feat');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  git(work, 'checkout', '-q', '-b', 'slice/a');
  commitFile(work, 'a.txt', 'a\n', 'the slice');
  git(work, 'push', '-q', 'origin', 'slice/a');
  git(work, 'checkout', '-q', 'main');
  commitFile(work, 'moved.txt', 'moved\n', 'main moved');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'checkout', '-q', 'feat/x');
  git(work, 'branch', '-q', '-D', 'slice/a', 'main', 'pilot');
  return { origin, work };
}

/** Points S6_ARGV at a fresh file beside the fixture and answers a reader of its lines. */
function echoed(work) {
  const file = path.join(path.dirname(work), 'argv.txt');
  fs.rmSync(file, { force: true });
  process.env.S6_ARGV = file;
  return () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);
}

// A selection takes no slot of its own: it sees only the one this process inherited (`-` outside a gate).
const NO_SLOT = `slot=${process.env.PILOT_GATE_SLOT ?? '-'}`;

const gh = (args) => (args[0] === 'pr' && args[1] === 'view' ? JSON.stringify({ mergeable: 'MERGEABLE' }) : args[0] === 'pr' ? '[]' : 'me\n');
const quiet = { findPr: () => ({ number: 12, title: 'feat(x): S1 the first slice' }), install: () => {}, gh };

test('a slice merge runs the selection since the tip before it', (t) => {
  const { work } = repos(t);
  const lines = echoed(work);
  const start = git(work, 'rev-parse', 'HEAD');

  const result = integrate('slice/a', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(lines(), [`changed --since=${start} ${NO_SLOT}`], 'the selection, since the start, in no slot');
  assert.match(result.line, new RegExp(`^integrated slice/a at [0-9a-f]+ \\(base pilot@[0-9a-f]+\\): 1 pass, 0 fail; selected 1 of 2 test files since ${start.slice(0, 7)}; pushed`));
});

test("sync selects since pilot's tip", (t) => {
  const { origin, work } = repos(t);
  const lines = echoed(work);
  const pilotTip = git(origin, 'rev-parse', 'refs/heads/pilot');

  const result = sync({ cwd: work, keep: path.join(path.dirname(work), 'kept-sync') });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(origin, 'rev-parse', `refs/heads/pilot^2`), git(origin, 'rev-parse', 'refs/heads/main'), 'main is merged into pilot');
  assert.deepEqual(lines(), [`changed --since=${pilotTip} ${NO_SLOT}`]);
});

test('a merge into pilot without since runs full', (t) => {
  const { origin, work } = repos(t);
  const lines = echoed(work);
  const source = git(work, 'rev-parse', 'origin/feat/x');

  const result = mergeIntoPilot({ cwd: work, source, message: 'Merge feat/x into pilot', label: 'feat/x' });

  assert.equal(result.merged, true, result.line);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), result.sha, 'pushed');
  // A slot taken here, or the one inherited from a gate around this file (`selected` under a selection).
  assert.match(lines()[0] ?? '', /^full slot=(\d+|selected)$/, 'npm test, inside a gate slot');
  assert.equal(lines().length, 1);
  assert.equal(result.counts, '1 pass, 0 fail');
});

test('an injected test command is run as given', (t) => {
  const { work } = repos(t);
  const lines = echoed(work);
  const injected = `node -e "require('fs').appendFileSync(process.env.S6_ARGV, 'injected slot=' + (process.env.PILOT_GATE_SLOT ?? '-') + '\\n')"`;

  const result = integrate('slice/a', { cwd: work, test: injected, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.match(lines()[0] ?? '', /^injected slot=(\d+|selected)$/, 'the injected command, inside a gate slot');
  assert.equal(lines().length, 1);
});
