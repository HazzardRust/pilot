/**
 * S8 of pilot-fork: once `pilot land` has pushed the landing, it deletes the run's merged
 * `design/<slug>`, `fix/<slug>-s<n>` and `qa/<slug>` branches through `deleteMerged`, into
 * `feat/<slug>`, and names what it keeps (spec 6, 8; L4, L5). Never `feat/<slug>`, never
 * another slug's branch, and nothing when the landing fails. Scratch bare remotes, `gh` faked.
 */

// A red run's log goes under a home of this process's own, never the real one.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { land, main } = await import('../land.mjs');
const { main: pruneMain } = await import('../branches.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const green = 'node -e "0"';
const heads = (repo) => git(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean).sort();

/**
 * origin.git holds main, pilot, and run x's feat/x with design/x (the Gate 1 merge), slice
 * slice/x-s1, fix/x-s1 and qa/x merged in, and slice/xx-s1 (another run's, merged); another run's
 * slice/y-s1, and design/x-y and fix/x-y-s1 merged into feat/x, so only their names keep them; `unmerged` adds
 * fix/x-s2, never merged. `work` is on feat/x.
 */
function scratchRun(t, { unmerged = false } = {}) {
  return gitFixture(t, `land-prune:scratchRun:${unmerged}`, (root) => buildScratchRun(root, unmerged));
}

function buildScratchRun(root, unmerged) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  // origin's history, written as one fast-import stream: a branch is one commit adding
  // `<name>.txt`, merged into feat/x with --no-ff.
  const stream = [];
  let marks = 0;
  const data = (text) => `data ${Buffer.byteLength(text)}\n${text}`;
  const commit = (ref, message, parents, name) => {
    const file = name ? [`M 100644 inline ${name.replace(/\W+/g, '-')}.txt`, data(`${name}\n`)] : [];
    stream.push(`commit refs/heads/${ref}`, `mark :${++marks}`, `committer test <t@example.com> ${1700000000 + marks} +0000`,
      data(message), ...parents.map((p, i) => `${i ? 'merge' : 'from'} :${p}`), ...file, '');
    return marks;
  };
  const main = commit('main', 'main', []);
  let feat = main;
  stream.push(`reset refs/heads/pilot\nfrom :${main}\n`);
  const into = (name, ref = name) => (feat = commit('feat/x', `Merge ${name} into feat/x`, [feat, commit(ref, name, [feat], name)], name));
  const gate1 = into('design/x');
  const sliceMerge = into('slice/x-s1');
  for (const name of ['fix/x-s1', 'qa/x', 'slice/xx-s1', 'design/x-y', 'fix/x-y-s1']) into(name);
  if (unmerged) commit('fix/x-s2', 'fix/x-s2', [feat], 'fix/x-s2');
  commit('slice/y-s1', 'slice/y-s1', [main], 'slice/y-s1');
  const exported = path.join(root, 'marks');
  execFileSync('git', ['fast-import', '--quiet', `--export-marks=${exported}`], { cwd: origin, input: stream.join('\n') });
  const sha = Object.fromEntries(fs.readFileSync(exported, 'utf8').trim().split('\n').map((line) => line.slice(1).split(' ')));
  fs.rmSync(exported);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/x', 'origin/feat/x');
  const inWork = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { root, origin, work, inWork, gate1: sha[gate1], sliceMerge: sha[sliceMerge] };
}

/** A fake `gh`: no PR for any head, `pr comment` and `pr ready` answered empty. */
const gh = (args) => {
  if (args[0] === 'pr' && args[1] === 'list') return '[]';
  if (args[0] === 'pr' && (args[1] === 'comment' || args[1] === 'ready')) return '';
  throw new Error(`unexpected gh ${args.join(' ')}`);
};

test("land deletes the run's merged slice branches", (t) => {
  const { origin, work, inWork } = scratchRun(t);

  const result = land({ cwd: work, git: inWork, gh, test: green });

  assert.deepEqual([...result.deleted].sort(), ['design/x', 'fix/x-s1', 'qa/x', 'slice/x-s1']);
  assert.deepEqual(result.kept, []);
  assert.deepEqual(heads(origin), ['design/x-y', 'feat/x', 'fix/x-y-s1', 'main', 'pilot', 'slice/xx-s1', 'slice/y-s1'], 'only pilot and feat/x stay from the run');
});

test('a planted unmerged fix branch survives and is named', (t) => {
  const { origin, work, inWork } = scratchRun(t, { unmerged: true });
  let out = '';
  t.mock.method(process.stdout, 'write', (text) => {
    out += text;
    return true;
  });

  const code = main([], { cwd: work, git: inWork, gh, test: green });

  t.mock.restoreAll();
  assert.equal(code, 0, out);
  assert.ok(heads(origin).includes('fix/x-s2'), 'the unmerged fix branch is still on origin');
  assert.match(out, /^kept: fix\/x-s2 \(not merged into origin\/feat\/x\)$/m);
  assert.match(out, /^deleted: design\/x, fix\/x-s1, qa\/x, slice\/x-s1$/m);
});

test('the gate1 and slice merge shas still resolve', (t) => {
  const { root, work, origin, inWork, gate1, sliceMerge } = scratchRun(t);

  land({ cwd: work, git: inWork, gh, test: green });

  const fresh = path.join(root, 'fresh');
  git(root, 'clone', '-q', origin, fresh);
  for (const sha of [gate1, sliceMerge]) git(fresh, 'cat-file', '-e', `${sha}^{commit}`);
});

test("another run's branches are untouched", (t) => {
  const { origin, work, inWork } = scratchRun(t);
  const tipOf = (name) => git(origin, 'rev-parse', `refs/heads/${name}`);
  const others = ['slice/y-s1', 'slice/xx-s1', 'design/x-y', 'fix/x-y-s1'];
  const tips = others.map(tipOf);

  const result = land({ cwd: work, git: inWork, gh, test: green });

  assert.deepEqual(others.map(tipOf), tips, 'still on origin at the same tips');
  const passed = [...result.deleted, ...result.kept.map(({ branch: b }) => b)];
  assert.ok(!passed.some((b) => others.includes(b) || b.startsWith('feat/')), `another slug or feat/ is never passed: ${passed}`);
});

test('under none, land lists and deletes nothing', (t) => {
  const { origin, work, inWork } = scratchRun(t);
  git(work, 'branch', '-q', '--no-track', 'pilot', 'origin/pilot');
  git(work, 'config', 'pilot.remote', 'none');
  const before = heads(origin);

  const result = land({ cwd: work, git: inWork, gh, test: green });

  assert.deepEqual([result.deleted, result.kept], [[], []]);
  assert.deepEqual(heads(origin), before);
});

test('a landing that fails deletes nothing', (t) => {
  const { origin, work, inWork } = scratchRun(t);
  const before = heads(origin);

  assert.throws(() => land({ cwd: work, git: inWork, gh, test: 'node -e "process.exit(1)"' }), /NOT landed/);

  assert.deepEqual(heads(origin), before);
});

test('a refused deletion is named after the landing, with what was kept', (t) => {
  const { origin, work, inWork } = scratchRun(t, { unmerged: true });
  // Origin takes the landing's pushes and refuses only a deletion.
  fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\nwhile read old new ref; do [ "$new" = 0000000000000000000000000000000000000000 ] && exit 1; done\nexit 0\n', { mode: 0o755 });
  let out = '';
  t.mock.method(process.stdout, 'write', (text) => {
    out += text;
    return true;
  });

  const code = main([], { cwd: work, git: inWork, gh, test: green });

  t.mock.restoreAll();
  assert.equal(code, 0, out);
  assert.match(out, /^kept: fix\/x-s2 \(not merged into origin\/feat\/x\)$/m);
  assert.match(out, /^branch deletion failed, some may be gone; check the run remote: git push origin --delete failed: /m);
  assert.ok(['design/x', 'fix/x-s1', 'qa/x', 'slice/x-s1'].every((name) => heads(origin).includes(name)), 'nothing deleted');
});

test('after a landing the dry run lists only the feature branch', (t) => {
  const { work, inWork } = scratchRun(t);
  land({ cwd: work, git: inWork, gh, test: green });
  let out = '';

  const code = pruneMain(['prune', '--slug', 'x', '--dry-run'], { cwd: work, gh, write: (text) => (out += text) });

  assert.equal(code, 0, out);
  const named = out.split('\n').filter((line) => /^(would delete|kept) /.test(line));
  assert.equal(named.length, 1, out);
  assert.match(named[0], /^kept feat\/x: /);
  assert.match(out, /^dry run: would delete 0, kept 1; nothing deleted$/m);
});
