/**
 * audit-f14 S7 (spec 6, 10; L2, L4, A5): `restack` brings each open own-repository feature PR level with its base.
 * It retargets a PR whose lower `feat/<N>` reads merged, merges a lower branch's fix forward, merges the default
 * branch into a sibling that no longer merges clean (generated paths regenerated), and stops on a hand conflict.
 * Origin is a scratch bare repository whose HEAD is `main`; the host is a stub answering `reviews` by its query
 * and recording `edit`. The tests read only origin's refs and the stub's edits.
 */

import { gitFixture } from './lib/git-fixture.mjs';
import { seed } from './lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { renderIndex } from '../adr-index.mjs';
import { landingMessage } from '../integrate.mjs';
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

/** ADRs `numbers` as files, and the generated index over exactly those, rendered in a scratch directory under `dir`. */
function adrs(dir, ...numbers) {
  const front = ['---', 'status: accepted', 'date: 2026-11-19', 'tags: []', 'supersedes: []', 'superseded_by: []', 'paths: []', '---'];
  const scratch = fs.mkdtempSync(path.join(dir, 'adr-'));
  const files = {};
  for (const number of numbers) {
    const file = `${number}-decision-${number}.md`;
    files[`docs/adr/${file}`] = [...front, `# Decision ${number}`, '', `We decided ${number}.`, ''].join('\n');
    fs.writeFileSync(path.join(scratch, file), files[`docs/adr/${file}`]);
  }
  files[INDEX] = renderIndex(scratch);
  fs.rmSync(scratch, { recursive: true, force: true });
  return files;
}

/**
 * Origin with main holding ADR 0001, its index and src/x.mjs; `work` is the checkout restack runs in. `stacked`:
 * feat/a off main, feat/b off feat/a. Otherwise siblings: feat/a and feat/b both off main, each adding an ADR (so the
 * index clashes), feat/a also changing src/x.mjs. Both land on pilot unless `landed` is false. `after` is what moved
 * on origin since, as `seed` history: a fix pushed, or main merging a branch as the user's merge button does.
 */
function build(dir, stacked, landed, after) {
  const history = [
    { branch: 'main', files: { ...adrs(dir, '0001'), 'src/x.mjs': 'export const x = 1;\n' }, message: 'main' },
    stacked
      ? { branch: 'feat/a', files: { 'a.txt': 'a\n' }, message: 'feat a' }
      : { branch: 'feat/a', files: { ...adrs(dir, '0001', '0002'), 'src/x.mjs': 'export const x = 2;\n' }, message: 'feat a' },
    stacked
      ? { branch: 'feat/b', files: { 'b.txt': 'b\n' }, message: 'feat b' }
      : { branch: 'feat/b', from: 'main', files: adrs(dir, '0001', '0003'), message: 'feat b' },
  ];
  // Landings as two-parent commits with the landing's own subject: restack reads pilot's first-parent subjects.
  if (landed) {
    history.push(
      { branch: 'pilot', from: 'main', merge: ['feat/a'], files: {}, message: landingMessage('feat/a', 'pilot') },
      { branch: 'pilot', merge: ['feat/b'], files: {}, message: landingMessage('feat/b', 'pilot') },
    );
  }
  const { origin, sha } = seed(dir, [...history, ...after]);
  const work = path.join(dir, 'work');
  run(dir, 'clone', '-q', origin, work);
  return { origin, work, sha };
}

const MERGE_A = { branch: 'main', merge: ['feat/a'], files: {}, message: 'Merge feat/a' };

/** Each repository shape the tests start from, built once per file. */
const repos = (t, shape) => {
  const [stacked, landed, after] = {
    stacked: [true, true, []],
    'stacked, a merged': [true, true, [MERGE_A]],
    'stacked, a fixed': [true, true, [{ branch: 'feat/a', files: { 'a.txt': 'a, fixed\n' }, message: 'fix a' }]],
    'siblings, a merged': [false, true, [MERGE_A]],
    'siblings unlanded, a merged': [false, false, [MERGE_A]],
    'siblings, b changes x, a merged': [false, true, [{ branch: 'feat/b', files: { 'src/x.mjs': 'export const x = 3;\n' }, message: 'b changes x' }, MERGE_A]],
  }[shape];
  return gitFixture(t, `restack:${shape}`, (dir) => build(dir, stacked, landed, after));
};

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

test('a merge commit retargets without a rewrite', (t) => {
  const { origin, work, sha } = repos(t, 'stacked, a merged');
  const before = sha['feat/b'];
  const { host, edits } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['retargeted #2 to main']);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, [[2, { base: 'main' }]]);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a fix on A reaches B', (t) => {
  const { origin, work, sha } = repos(t, 'stacked, a fixed');
  const fix = sha['feat/a'];
  const before = sha['feat/b'];
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

test('an unlanded feature PR is never merged forward', (t) => {
  const { origin, work, sha } = repos(t, 'siblings unlanded, a merged');
  const before = sha['feat/b'];
  const { host } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['level #2']);
  assert.equal(out.exitCode, 0);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('a sibling\'s generated clash heals', (t) => {
  const { origin, work, sha } = repos(t, 'siblings, a merged');
  const main = sha.main;
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
  const { origin, work, sha } = repos(t, 'siblings, b changes x, a merged');
  const before = sha['feat/b'];
  const { host } = stubHost([pr({ number: 1, head: 'feat/a', state: 'merged' }), pr({ number: 2, head: 'feat/b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['conflict feat/b with main: src/x.mjs']);
  assert.equal(out.exitCode, 3);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('only an open own-repository feature PR is touched', (t) => {
  const { origin, work, sha } = repos(t, 'stacked, a merged');
  const { host, edits } = stubHost([
    pr({ number: 1, head: 'feat/a', state: 'merged' }),
    pr({ number: 2, head: 'feat/b', base: 'feat/a', crossRepo: true }),
    pr({ number: 3, head: 'slice/b-s1', base: 'feat/a' }),
    pr({ number: 4, head: 'feat/-x', base: 'feat/a' }),
  ]);
  const before = sha['feat/b'];

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, []);
  assert.equal(out.exitCode, 0);
  assert.deepEqual(edits, []);
  assert.equal(tip(origin, 'feat/b'), before);
});

test('a lower branch gone from origin fails that PR', (t) => {
  const { origin, work, sha } = repos(t, 'stacked');
  run(origin, 'branch', '-q', '-D', 'feat/a');
  const before = sha['feat/b'];
  const { host } = stubHost([pr({ number: 2, head: 'feat/b', base: 'feat/a' })]);

  const out = restackIn(work, host);

  assert.equal(out.lines.length, 1);
  assert.match(out.lines[0], /^restack failed for #2: /);
  assert.equal(out.exitCode, 1);
  assert.equal(tip(origin, 'feat/b'), before);
  assert.deepEqual(out.calls.filter((args) => args[0] === 'push'), []);
});

test('a base that is no plain branch name fails that PR', (t) => {
  const { work } = repos(t, 'stacked');
  const { host, edits } = stubHost([pr({ number: 2, head: 'feat/b', base: 'feat/a b' })]);

  const out = restackIn(work, host);

  assert.deepEqual(out.lines, ['restack failed for #2: base "feat/a b" is not a plain feat/ branch']);
  assert.equal(out.exitCode, 1);
  assert.deepEqual(edits, []);
});

test('a host that cannot be asked fails', (t) => {
  const { work } = repos(t, 'stacked');
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
