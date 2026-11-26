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
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { integrate } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');
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

/**
 * origin.git: main holds package.json, its lock and echo.mjs; pilot is main plus one commit;
 * feat/x is cut from main with one commit; slice/a adds a.txt to feat/x; then main moves by one
 * commit. The clone is on feat/x with origin/HEAD naming main; `tip` is each branch's seeded tip.
 */
function repos(t) {
  return gitFixture(t, 'integrate-select:repos', buildRepos);
}

function buildRepos(root) {
  const work = path.join(root, 'work');
  const { origin, sha } = seed(root, [
    { branch: 'main', files: { 'package.json': PACKAGE, 'package-lock.json': LOCK, 'echo.mjs': ECHO }, message: 'main' },
    { branch: 'pilot', files: { 'pilot.txt': 'pilot\n' }, message: 'pilot only' },
    { branch: 'feat/x', from: 'main', files: { 'feat.txt': 'feat\n' }, message: 'feat' },
    { branch: 'slice/a', files: { 'a.txt': 'a\n' }, message: 'the slice' },
    { branch: 'main', files: { 'moved.txt': 'moved\n' }, message: 'main moved' },
  ]);
  // The clone holds feat/x alone, tracking origin's; origin/HEAD names main.
  git(root, 'clone', '-q', '-b', 'feat/x', origin, work);
  return { origin, work, tip: sha };
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
const quiet = { install: () => {}, host: githubHost(gh) };

test('a slice merge runs the selection since the tip before it', (t) => {
  const { work, tip } = repos(t);
  const lines = echoed(work);
  const start = tip['feat/x'];

  const result = integrate('slice/a', { cwd: work, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(lines(), [`changed --since=${start} ${NO_SLOT}`], 'the selection, since the start, in no slot');
  assert.match(result.line, new RegExp(`^integrated slice/a at [0-9a-f]+ \\(base pilot@[0-9a-f]+\\): 1 pass, 0 fail; selected 1 of 2 test files since ${start.slice(0, 7)}; pushed`));
});

test("sync selects since pilot's tip", (t) => {
  const { origin, work, tip } = repos(t);
  const lines = echoed(work);
  const pilotTip = tip.pilot;

  const result = sync({ cwd: work, keep: path.join(path.dirname(work), 'kept-sync') });

  assert.equal(result.merged, true, result.line);
  const [mergedIn, mainTip] = git(origin, 'rev-parse', 'refs/heads/pilot^2', 'refs/heads/main').split('\n');
  assert.equal(mergedIn, mainTip, 'main is merged into pilot');
  assert.deepEqual(lines(), [`changed --since=${pilotTip} ${NO_SLOT}`]);
});

test('a merge into pilot without since runs full', (t) => {
  const { origin, work, tip } = repos(t);
  const lines = echoed(work);
  const source = tip['feat/x'];

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
