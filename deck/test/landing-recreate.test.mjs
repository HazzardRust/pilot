/**
 * A gone worktree is recreated and landed (three-lanes S12, spec 16). `worktreeFor` meets a run
 * record whose worktree was deleted by fetching `origin/feat/<slug>` and adding the worktree again
 * at the same path, only when that tip is the gate2's own `sha`; the landing line then opens
 * `recreated <path> at <sha7>; `. Every git call runs on a scratch clone of a local bare origin.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2 } from '../items.mjs';
import { startLanding, worktreeFor } from '../landing.mjs';
import { DeckRefusal, listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SLUG = 'x';
const BRANCH = `feat/${SLUG}`;
const LANDED = 'landed feat/x on pilot at 1a2b3c4';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * A bare origin holding `feat/x`, the clone the gate2 names as its repository, and a real linked
 * worktree of that clone on `feat/x`, all under one temp directory removed when the test ends.
 */
function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-landing-recreate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'wt');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, repo);
  for (const [key, value] of [['user.name', 'test'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false']]) {
    git(repo, 'config', key, value);
  }
  const commit = (cwd, file, text) => {
    fs.writeFileSync(path.join(cwd, file), text);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-q', '-m', `${file}: ${text}`);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  commit(repo, 'a.txt', 'base\n');
  git(repo, 'push', '-q', 'origin', 'HEAD:main');
  git(repo, 'worktree', 'add', '-q', '-b', BRANCH, worktree);
  const sha = commit(worktree, 'b.txt', 'feature\n');
  git(worktree, 'push', '-q', 'origin', `HEAD:${BRANCH}`);
  return { root, origin, repo, worktree, sha, commit };
}

/** A gate2 at `sha` on a yellow ticket whose run record names `worktree` under the slug. */
function aGate(repo, worktree, sha) {
  const evidence = withTicket({ pr: '#250', sha }, repo, 'yellow');
  const run = registerRun({ repo, pid: 4242 });
  setSlices(run.id, [{ slice: SLUG, state: 'in QA', branch: BRANCH }], undefined, { slug: SLUG, ticket: evidence.ticket, worktree });
  return postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
}

/** A `spawn` stand-in that keeps the child and the cwd it was started in. */
function aSpawn() {
  const held = {};
  held.spawn = (_cmd, _args, options) => {
    const child = new EventEmitter();
    child.pid = 9001;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    held.child = child;
    held.cwd = options.cwd;
    return child;
  };
  return held;
}

const lastLine = (id) => listItems().find((item) => item.id === id).replies.at(-1).text;

test('a removed worktree is recreated and the landing runs', (t) => {
  tempDeck(t);
  const { repo, worktree, sha } = scratch(t);
  const gate = aGate(repo, worktree, sha);
  fs.rmSync(worktree, { recursive: true, force: true });

  const held = aSpawn();
  startLanding(gate.id, { spawn: held.spawn, env: {} });
  assert.equal(held.cwd, worktree, 'land runs in the recreated worktree');
  assert.equal(git(worktree, 'rev-parse', 'HEAD'), sha, "the worktree is back at the gate2's sha");
  held.child.stdout.emit('data', `${LANDED}\n`);
  held.child.emit('close', 0, null);

  assert.equal(lastLine(gate.id), `recreated ${worktree} at ${sha.slice(0, 7)}; ${LANDED}`);
});

test("a branch tip that is not the gate2's sha refuses", (t) => {
  tempDeck(t);
  const { repo, worktree, sha, commit } = scratch(t);
  const gate = aGate(repo, worktree, sha);
  const moved = commit(worktree, 'c.txt', 'later\n');
  git(worktree, 'push', '-q', 'origin', `HEAD:${BRANCH}`);
  fs.rmSync(worktree, { recursive: true, force: true });

  assert.throws(
    () => worktreeFor(gate),
    (err) => err instanceof DeckRefusal && err.message === `NOT landed: origin/${BRANCH} is at ${moved.slice(0, 7)}, the gate2 signed ${sha}; nothing run`,
  );
  assert.equal(fs.existsSync(worktree), false, 'nothing is recreated at another sha');
});

test('a local branch holding commits origin lacks refuses rather than reset', (t) => {
  tempDeck(t);
  const { repo, worktree, sha, commit } = scratch(t);
  const gate = aGate(repo, worktree, sha);
  const unpushed = commit(worktree, 'd.txt', 'unpushed\n');
  fs.rmSync(worktree, { recursive: true, force: true });

  assert.throws(
    () => worktreeFor(gate),
    (err) => err instanceof DeckRefusal && err.message === `NOT landed: the local ${BRANCH} holds 1 commits origin/${BRANCH} does not, at ${unpushed.slice(0, 7)}; nothing run`,
  );
  assert.equal(git(repo, 'rev-parse', `refs/heads/${BRANCH}`), unpushed, 'the local branch keeps its commits');
  assert.equal(fs.existsSync(worktree), false, 'nothing is recreated');
});

test('a present worktree is used as it is', (t) => {
  tempDeck(t);
  const { repo, worktree, sha, origin } = scratch(t);
  const gate = aGate(repo, worktree, sha);
  // With origin gone, a fetch would fail: a present worktree never reaches it.
  fs.rmSync(origin, { recursive: true, force: true });

  assert.deepEqual(worktreeFor(gate), { worktree, recreated: false });
});
