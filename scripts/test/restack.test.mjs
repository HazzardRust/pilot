/**
 * audit-f14 S7 (spec 6, 10; L2, L4, A5): `restack` brings each open own-repository feature PR level with its base.
 * It retargets a PR whose lower `feat/<N>` reads merged, merges a lower branch's fix forward, merges the default
 * branch into a sibling that no longer merges clean (generated paths regenerated), and stops on a hand conflict.
 * Origin is a scratch bare repository whose HEAD is `main`; the host is a stub answering `reviews` by its query
 * and recording `edit`. The tests read only origin's refs and the stub's edits.
 */

import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { renderIndex } from '../adr-index.mjs';
import { restack } from '../stack.mjs';

const INDEX = 'docs/adr/README.md';
const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tip = (origin, branch) => run(origin, 'rev-parse', `refs/heads/${branch}`);
const isAncestor = (repo, a, b) => {
  try {
    run(repo, 'merge-base', '--is-ancestor', a, b);
    return true;
  } catch {
    return false;
  }
};

function commit(repo, files, message) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
  run(repo, 'add', '-A');
  run(repo, 'commit', '-q', '-m', message);
}

/** ADR `number` written into `repo`, and the generated index over every ADR it holds. */
function adr(repo, number) {
  const front = ['---', 'status: accepted', 'date: 2026-11-19', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  const file = `docs/adr/${number}-decision-${number}.md`;
  const text = [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n');
  fs.mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
  return { [file]: text, [INDEX]: renderIndex(path.join(repo, 'docs', 'adr')) };
}

/**
 * Origin with main holding ADR 0001, its index and src/x.mjs; `seed` moves branches; `work` is the checkout restack
 * runs in. `stacked`: feat/a off main, feat/b off feat/a. Otherwise siblings: feat/a and feat/b both off main, each
 * adding an ADR (so the index clashes), feat/a also changing src/x.mjs.
 */
function build(dir, stacked) {
  const origin = path.join(dir, 'origin.git');
  run(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  run(origin, 'config', 'core.logAllRefUpdates', 'always');
  const seed = path.join(dir, 'seed');
  run(dir, 'clone', '-q', origin, seed);
  run(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, { ...adr(seed, '0001'), 'src/x.mjs': 'export const x = 1;\n' }, 'main');
  run(seed, 'push', '-q', 'origin', 'main');
  run(seed, 'checkout', '-q', '-b', 'feat/a', 'main');
  if (stacked) commit(seed, { 'a.txt': 'a\n' }, 'feat a');
  else commit(seed, { ...adr(seed, '0002'), 'src/x.mjs': 'export const x = 2;\n' }, 'feat a');
  run(seed, 'checkout', '-q', '-b', 'feat/b', stacked ? 'feat/a' : 'main');
  if (stacked) commit(seed, { 'b.txt': 'b\n' }, 'feat b');
  else commit(seed, adr(seed, '0003'), 'feat b');
  run(seed, 'push', '-q', 'origin', 'feat/a', 'feat/b');
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { origin, seed, work };
}

const repos = (t, stacked) => gitFixture(t, `restack:${stacked ? 'stacked' : 'siblings'}`, (dir) => build(dir, stacked));

/** A host whose `reviews` filters `prs` by the query's head, base and state; every edit is kept. */
function stubHost(prs) {
  const edits = [];
  const host = {
    reviews: ({ head, base, state }) =>
      prs.filter((pr) => (head === undefined || pr.head === head) && (base === undefined || pr.base === base) && (state === 'all' || pr.state === state)),
    edit: (number, change) => (edits.push([number, change]), {}),
  };
  return { host, edits };
}

const pr = (over) => ({ number: 1, state: 'open', base: 'main', head: 'feat/a', headSha: 'a'.repeat(40), body: '', crossRepo: false, ...over });

/** `restack` in `work`, every git argv it runs through `git` kept in `calls`. */
function restackIn(work, host) {
  const calls = [];
  const git = (args) => (calls.push(args), run(work, ...args));
  return { ...restack({ cwd: work, git, host }), calls };
}

/** Merges `branch` into main in `seed` with a merge commit, as the user's merge button does, and pushes main. */
function mergeIntoMain(seed, branch) {
  run(seed, 'fetch', '-q', 'origin');
  run(seed, 'checkout', '-q', '-B', 'main', 'origin/main');
  run(seed, 'merge', '-q', '--no-ff', '-m', `Merge ${branch}`, `origin/${branch}`);
  run(seed, 'push', '-q', 'origin', 'main');
}

test('a merge commit retargets without a rewrite', (t) => {
  const { origin, seed, work } = repos(t, true);
  mergeIntoMain(seed, 'feat/a');
  const before = tip(origin, 'feat/b');
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['retargeted #2 to main']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, [[2, { base: 'main' }]]);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a fix on A reaches B', (t) => {
  const { origin, seed, work } = repos(t, true);
  run(seed, 'checkout', '-q', 'feat/a');
  commit(seed, { 'a.txt': 'a, fixed\n' }, 'fix a');
  run(seed, 'push', '-q', 'origin', 'feat/a');
  const fix = tip(origin, 'feat/a');
  const before = tip(origin, 'feat/b');
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a' }), pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['level #1', 'merged feat/a into feat/b']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, []);
  const after = tip(origin, 'feat/b');
  assert.ok(isAncestor(origin, fix, after), 'feat/b holds the fix');
  assert.ok(isAncestor(origin, before, after), 'feat/b only moved forward');
  const pushes = out.calls.filter((args) => args[0] === 'push');
  assert.equal(pushes.length, 1);
  assert.ok(pushes[0].every((arg) => !/^--force|^-f$|^\+/.test(arg)), `no force: ${pushes[0].join(' ')}`);
});

test('a sibling\'s generated clash heals', (t) => {
  const { origin, seed, work } = repos(t, false);
  mergeIntoMain(seed, 'feat/a');
  const main = tip(origin, 'main');
  const { host } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['merged main into feat/b']);
  assert.equal(out.exitCode, 0);
  assert.ok(isAncestor(origin, main, tip(origin, 'feat/b')), 'feat/b holds main');
  const index = run(origin, 'show', `refs/heads/feat/b:${INDEX}`);
  for (const number of ['0001', '0002', '0003']) assert.match(index, new RegExp(`\\| ${number} \\|`));
  assert.doesNotMatch(index, /^[<=>]{7}/m);
});

test('a hand conflict stops', (t) => {
  const { origin, seed, work } = repos(t, false);
  run(seed, 'checkout', '-q', 'feat/b');
  commit(seed, { 'src/x.mjs': 'export const x = 3;\n' }, 'b changes x');
  run(seed, 'push', '-q', 'origin', 'feat/b');
  mergeIntoMain(seed, 'feat/a');
  const before = tip(origin, 'feat/b');
  const { host } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['conflict feat/b: src/x.mjs']);
  assert.equal(out.exitCode, 3);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('only an open own-repository feature PR is touched', (t) => {
  const { origin, seed, work } = repos(t, true);
  mergeIntoMain(seed, 'feat/a');
  const { host, edits } = stubHost([
    pr({ number: 1, head: 'feat/a', state: 'merged' }),
    pr({ number: 2, head: 'feat/b', base: 'feat/a', crossRepo: true }),
    pr({ number: 3, head: 'slice/b-s1', base: 'feat/a' }),
    pr({ number: 4, head: 'feat/-x', base: 'feat/a' }),
  ]);
  const before = tip(origin, 'feat/b');

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, []);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, []);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a lower branch gone from origin fails that PR', (t) => {
  const { origin, seed, work } = repos(t, true);
  run(seed, 'push', '-q', 'origin', '--delete', 'feat/a');
  const before = tip(origin, 'feat/b');
  const { host } = stubHost([pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.equal(out.lines.length, 1);
  assert.match(out.lines[0], /^restack failed for #2: /);
  assert.equal(out.exitCode, 1);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('a base that is no plain branch name fails that PR', (t) => {
  const { work } = repos(t, true);
  const { host, edits } = stubHost([pr({ number: 2, head: 'feat/b', base: 'feat/a b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['restack failed for #2: base "feat/a b" is not a plain feat/ branch']);
  assert.equal(out.exitCode, 1);
  assert.deepEqual(edits, []);
});

test('a host that cannot be asked fails', (t) => {
  const { work } = repos(t, true);
  const host = {
    reviews: () => {
      throw new Error('gh: not logged in');
    },
    edit: () => assert.fail('nothing is edited'),
  };

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['restack failed: gh: not logged in']);
  assert.equal(out.exitCode, 1);
});
