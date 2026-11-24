/**
 * tested-once S2 (spec 1; L3, L4): `integrate` takes a green, complete ledger row for the merge's
 * exact tree since the feature tip as the slice's proof and starts no test process. The row is
 * written by `runTests` itself, run in a clone on the slice branch as the implementer's gate runs.
 * A scratch bare origin and a scratch home per test; nothing reaches GitHub, a deck or the live ledger.
 */

// The fixture seam imports fake-home.mjs first: a home nobody passes is a temp dir.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { integrate, runTests } = await import('../integrate.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');
const { recordRun } = await import('../test-ledger.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/** Each run of a script appends one line to the file S2_COUNT names, then prints node --test's summary. */
const COUNT = [
  "import fs from 'node:fs';",
  "fs.appendFileSync(process.env.S2_COUNT, `${process.argv.slice(2).join(' ')}\\n`);",
  "console.log('ℹ pass 1');",
  "console.log('ℹ fail 0');",
  '',
].join('\n');

const PACKAGE = `${JSON.stringify({ name: 's2', private: true, scripts: { test: 'node count.mjs full', 'test:changed': 'node count.mjs changed' } }, null, 2)}\n`;

function commitFile(work, file, text, message) {
  fs.writeFileSync(path.join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '-q', '-m', message);
}

/**
 * origin.git: main holds package.json and count.mjs; pilot is main; feat/x is pilot plus one
 * commit; slice/a is feat/x plus a.txt. `work` is on feat/x, `slice` a clone on slice/a.
 */
function buildRepos(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  const slice = path.join(root, 'slice');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'package.json'), PACKAGE);
  fs.writeFileSync(path.join(work, 'count.mjs'), COUNT);
  git(work, 'add', 'package.json', 'count.mjs');
  git(work, 'commit', '-q', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'push', '-q', 'origin', 'main:pilot');
  git(work, 'checkout', '-q', '-b', 'feat/x');
  commitFile(work, 'feat.txt', 'feat\n', 'feat');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  git(work, 'checkout', '-q', '-b', 'slice/a');
  commitFile(work, 'a.txt', 'a\n', 'the slice');
  git(work, 'push', '-q', 'origin', 'slice/a');
  git(work, 'checkout', '-q', 'feat/x');
  git(work, 'branch', '-q', '-D', 'slice/a', 'main');
  git(root, 'clone', '-q', '-b', 'slice/a', origin, slice);
  return { origin, work, slice };
}

/** The repositories, a scratch home, and a reader of the counted runs since the last `reset`. */
function setup(t) {
  const repos = gitFixture(t, 'integrate-reuse:repos', buildRepos);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-integrate-reuse-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, 'count.txt');
  process.env.S2_COUNT = file;
  const runs = () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0);
  const reset = () => fs.rmSync(file, { force: true });
  return { ...repos, home, runs, reset };
}

/** The implementer's phase gate in the slice clone, since the feat tip: `runTests` writes its row. */
function gate({ slice, work, home }, command) {
  const since = git(work, 'rev-parse', 'HEAD');
  return runTests(slice, command ?? `npm run test:changed -- --since=${since}`, { label: 'gate', where: 'implementer', since, home, slot: false });
}

const ledgerRows = (home) => fs.readFileSync(path.join(home, '.claude', 'pilot', 'tests', 'ledger.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

const gh = (args) => (args[0] === 'pr' && args[1] === 'view' ? JSON.stringify({ mergeable: 'MERGEABLE' }) : args[0] === 'pr' ? '[]' : 'me\n');
const quiet = { install: () => {}, host: githubHost(gh) };
const TRAILERS = ['Reviewed-by: pilot:typescript-reviewer: approve', 'Claude-Session: s'];

test('an unmoved slice is not tested again', (t) => {
  const s = setup(t);
  assert.equal(gate(s).status, 0);
  const sha7 = git(s.slice, 'rev-parse', '--short=7', 'HEAD');
  s.reset();

  const result = integrate('slice/a', { cwd: s.work, home: s.home, trailers: TRAILERS, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(s.runs(), 0, 'no test process starts');
  assert.match(result.line, new RegExp(`^integrated slice/a at [0-9a-f]+ \\(base pilot@[0-9a-f]+\\): tests reused: implementer ${sha7}; pushed`));
});

test('a moved base runs', (t) => {
  const s = setup(t);
  assert.equal(gate(s).status, 0);
  commitFile(s.work, 'moved.txt', 'moved\n', 'the base moved');
  s.reset();

  const result = integrate('slice/a', { cwd: s.work, home: s.home, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(s.runs(), 1, 'the script runs once');
  assert.doesNotMatch(result.line, /tests reused/);
});

test('a red or deferred row runs', async (t) => {
  await t.test('red', (t) => {
    const s = setup(t);
    assert.equal(gate(s, 'node -e "process.exit(1)"').status, 1);

    const result = integrate('slice/a', { cwd: s.work, home: s.home, ...quiet });

    assert.equal(result.ok, true, result.line);
    assert.equal(s.runs(), 1);
  });
  await t.test('deferred', (t) => {
    const s = setup(t);
    assert.equal(gate(s).status, 0);
    const [green] = ledgerRows(s.home);
    fs.rmSync(path.join(s.home, '.claude', 'pilot', 'tests', 'ledger.jsonl'));
    recordRun({ ...green, scope: 'selected 1 of 2 test files; 1 deferred to integrate' }, { home: s.home });
    s.reset();

    const result = integrate('slice/a', { cwd: s.work, home: s.home, ...quiet });

    assert.equal(result.ok, true, result.line);
    assert.equal(s.runs(), 1);
  });
});

test('an injected test command runs whatever the ledger holds', (t) => {
  const s = setup(t);
  assert.equal(gate(s).status, 0);
  s.reset();

  const result = integrate('slice/a', { cwd: s.work, home: s.home, ...quiet, test: 'node count.mjs injected' });

  assert.equal(result.ok, true, result.line);
  assert.equal(s.runs(), 1);
});

test('the reused integrate still commits and pushes', (t) => {
  const s = setup(t);
  assert.equal(gate(s).status, 0);
  s.reset();

  const result = integrate('slice/a', { cwd: s.work, home: s.home, trailers: TRAILERS, ...quiet });

  assert.equal(result.ok, true, result.line);
  assert.equal(s.runs(), 0);
  const tip = 'refs/heads/feat/x';
  assert.equal(git(s.origin, 'rev-parse', `${tip}^2`), git(s.slice, 'rev-parse', 'HEAD'), 'the slice is the merge\'s second parent on origin');
  const body = git(s.origin, 'log', '-1', '--format=%B', tip);
  for (const line of TRAILERS) assert.ok(body.includes(line), `${line} on the pushed merge`);
});
