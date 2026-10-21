/**
 * A gate2 is refused only when it does not merge clean onto pilot (lander spec 3;
 * one-integration-line spec 1): `cleanOnPilot` reads pilot as fetched, with local git only, and
 * `callTool('deck_post')` answers its refusal; a tip behind origin/main still posts. Real
 * repositories: a clone of a local bare origin; nothing reaches GitHub or fetches.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cleanOnPilot } from '../gate2-base.mjs';
import { onSearchPath } from '../../hooks/lib/platform.js';
import { searchPathOnly } from '../../scripts/pilot-branch.mjs';
import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { DeckRefusal, listItems } from '../store.mjs';
import { bearer } from '../../hooks/lib/deck-secret.js';
import { freePort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A bare origin whose `main` is the default, a clone of it, and `feat/x` cut from `main` with one commit. */
function scratch(t) {
  return gitFixture(t, 'gate2-base:scratch', buildScratch);
}

function buildScratch(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  const commit = (file, text) => {
    fs.writeFileSync(path.join(work, file), text);
    git(work, 'add', file);
    git(work, 'commit', '-q', '-m', `${file}: ${text}`);
    return git(work, 'rev-parse', 'HEAD');
  };
  commit('a.txt', 'base\n');
  git(work, 'push', '-q', 'origin', 'HEAD:main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'feat/x');
  const feat = commit('feat.txt', 'feature\n');
  return { work, feat };
}

/** Posts a gate2 for `sha` in `repo` through `callTool`, on a live ticket. */
function postGate2(repo, sha) {
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo, state: 'yellow' });
  takeLive(id);
  return callTool('deck_post', { kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, pr: '#250', sha, ticket: id });
}

const gate2s = () => listItems().filter((item) => item.kind === KIND_GATE2);

// lander S5, spec 3 (L6): a gate2 must merge clean onto the run remote's pilot as fetched:
// `git merge-tree` lists no source conflict, or a kept land worktree holds the lander's
// committed merge of the sha. Local git only, no fetch.

/**
 * `scratch`'s shape plus a pilot at origin that changed `shared.txt` and the ADR index from
 * main; `conflict` (on feat/x) changes `shared.txt` too, and `indexOnly` (on feat/y) only the index.
 */
function onPilot(t) {
  return gitFixture(t, 'gate2-base:on-pilot', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    const commit = (files, message) => {
      for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
        fs.writeFileSync(path.join(work, file), text);
        git(work, 'add', file);
      }
      git(work, 'commit', '-q', '-m', message);
      return git(work, 'rev-parse', 'HEAD');
    };
    commit({ 'shared.txt': 'base\n', 'docs/adr/README.md': 'index\n' }, 'base');
    git(work, 'push', '-q', 'origin', 'HEAD:main');
    git(work, 'remote', 'set-head', 'origin', 'main');
    git(work, 'checkout', '-q', '-b', 'pilot');
    commit({ 'shared.txt': 'pilot\n', 'docs/adr/README.md': 'index pilot\n' }, 'pilot moves');
    git(work, 'push', '-q', 'origin', 'pilot');
    git(work, 'checkout', '-q', '-b', 'feat/y', 'main');
    const indexOnly = commit({ 'docs/adr/README.md': 'index feat\n' }, 'feat/y index');
    git(work, 'checkout', '-q', '-b', 'feat/x', 'main');
    const conflict = commit({ 'shared.txt': 'feat\n' }, 'feat/x shared');
    return { work, conflict, indexOnly };
  });
}

test('a tip behind origin/main is accepted', (t) => {
  tempDeck(t);
  const { work } = onPilot(t);
  git(work, 'checkout', '-q', '-b', 'feat/z', 'origin/pilot');
  fs.writeFileSync(path.join(work, 'z.txt'), 'feature\n');
  git(work, 'add', 'z.txt');
  git(work, 'commit', '-q', '-m', 'feat/z');
  const tip = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(work, 'main.txt'), 'moved on\n');
  git(work, 'add', 'main.txt');
  git(work, 'commit', '-q', '-m', 'main moves');
  git(work, 'push', '-q', 'origin', 'main');
  assert.equal(git(work, 'rev-list', '--count', `${tip}..origin/main`), '1', 'origin/main is one commit ahead of the tip');
  assert.match(postGate2(work, tip).content[0].text, /^Posted itm_/);
  assert.equal(gate2s().length, 1);
});

test('a tip conflicting with pilot is still refused', (t) => {
  tempDeck(t);
  const { work, conflict } = onPilot(t);
  assert.match(cleanOnPilot(work, '--output=x').why, /not a commit sha/, 'refused before git is asked');
  const unknown = cleanOnPilot(work, 'deadbeefdeadbeef');
  assert.equal(unknown.ok, false);
  assert.throws(
    () => postGate2(work, 'deadbeefdeadbeef'),
    (error) => error instanceof DeckRefusal && error.message === `NOT posted: deadbeefdeadbeef could not be checked against origin/pilot: ${unknown.why}`,
  );
  const clean = cleanOnPilot(work, conflict);
  assert.equal(clean.ok, false);
  assert.deepEqual(clean.paths, ['shared.txt']);
  assert.throws(
    () => postGate2(work, conflict),
    (error) => error instanceof DeckRefusal && error.message === `NOT posted: ${conflict} conflicts with origin/pilot in shared.txt; the lander resolves it first`,
  );
  assert.equal(gate2s().length, 0, 'no gate2 stored');
});

test('a conflict only in the ADR index counts as clean', (t) => {
  tempDeck(t);
  const { work, indexOnly } = onPilot(t);
  assert.deepEqual(cleanOnPilot(work, indexOnly), { ok: true });
  assert.match(postGate2(work, indexOnly).content[0].text, /^Posted itm_/);
});

test('a prepared merge of the sha is accepted', (t) => {
  tempDeck(t);
  const { work, conflict } = onPilot(t);
  const dir = `${work}-land-x`;
  git(work, 'worktree', 'add', '-q', '--detach', dir, 'origin/pilot');
  spawnSync('git', ['merge', '-q', '--no-ff', '--no-commit', conflict], { cwd: dir });
  assert.equal(cleanOnPilot(work, conflict).ok, false, 'mid-merge is not yet clean');
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'resolved\n');
  git(dir, 'add', 'shared.txt');
  git(dir, 'commit', '-q', '--no-edit');
  assert.deepEqual(cleanOnPilot(work, conflict), { ok: true });
  assert.match(postGate2(work, conflict).content[0].text, /^Posted itm_/);

  git(dir, 'checkout', '-q', '--detach', 'origin/pilot');
  assert.equal(cleanOnPilot(work, conflict).ok, false, 'a land worktree holding no merge of the sha does not count');
});

// gate-no-stall S7 and S8, spec 6 and 7 (added): on Windows a bare `git` with `cwd: repo` can
// resolve to a `git.exe` in the repository itself (libuv searches the cwd first unless the
// process's environment sets NoDefaultCurrentDirectoryInExePath), so a repository could choose
// the git the pilot runs there. Each process entry sets it (S8): the `pilot` CLI and the deck
// daemon, spawned here from a parent that has it unset. The planted git is whoami.exe, as both
// git.com and git.exe: it answers no git question.
const FLAG = 'NoDefaultCurrentDirectoryInExePath';
const PLANTED = { skip: process.platform !== 'win32' && 'only Windows searches the cwd for a bare command name' };

/** The scratch clone with whoami planted as its git, and an environment without the flag and with `.` on PATH. */
function planted(t) {
  const repo = scratch(t);
  const whoami = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');
  for (const name of ['git.com', 'git.exe']) fs.copyFileSync(whoami, path.join(repo.work, name));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === FLAG.toLowerCase()) delete env[key];
  // A relative PATH entry is looked up against the cwd even with the flag set: the entry drops it.
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
  env[key] = `.;${env[key] ?? ''}`;
  return { ...repo, env };
}

const PILOT = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const DAEMON = fileURLToPath(new URL('../daemon.mjs', import.meta.url));

test('the pilot CLI does not run a git planted in the repository', PLANTED, (t) => {
  const { work, env } = planted(t);
  // A deck directory with no secret: `pilot base` asks no deck, least of all the user's live one (pilot-develop-line S5).
  const noDeck = { ...env, PILOT_DECK_DIR: path.join(work, '..', 'no-deck') };
  const run = spawnSync(process.execPath, [PILOT, 'base'], { cwd: work, env: noDeck, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^base pilot [0-9a-f]{7,} \(created from main\) \(deck not reached\)$/m);
});

test('the deck daemon does not run a git planted in the repository', PLANTED, async (t) => {
  const dir = tempDeck(t);
  const { work, feat, env } = planted(t);
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: work, state: 'yellow' });
  takeLive(id);
  const port = await freePort();
  const daemon = spawn(process.execPath, [DAEMON], {
    cwd: os.tmpdir(),
    env: { ...env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port), PILOT_DECK_NO_OPEN: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  // Ended here, before any t.after removes the dirs: the daemon holds deck.log open until it exits.
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 10_000;
    for (;;) {
      const up = await fetch(`${base}/api/health`).then((response) => response.ok, () => false);
      if (up) break;
      assert.ok(Date.now() < deadline && daemon.exitCode === null, 'the daemon never answered');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const response = await fetch(`${base}/api/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(dir) },
      body: JSON.stringify({ name: 'deck_post', arguments: { kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: work, pr: '#250', sha: feat, ticket: id } }),
    });
    const result = await response.json();
    assert.match(result.content?.[0]?.text ?? JSON.stringify(result), /^Posted itm_/);
  } finally {
    if (daemon.exitCode === null && daemon.signalCode === null) {
      daemon.kill();
      await new Promise((resolve) => daemon.once('exit', resolve));
    }
  }
});

test('an entry keeps the absolute PATH entries only, on Windows alone', () => {
  const env = { Path: String.raw`.;bin;"rel\quoted";;C:rel;C:\Git\cmd;"C:\Program Files\Git\cmd"` };
  searchPathOnly(env, 'win32');
  assert.deepEqual(env, { Path: String.raw`C:\Git\cmd;"C:\Program Files\Git\cmd"`, [FLAG]: '1' });
  const posix = { PATH: '.:/usr/bin' };
  searchPathOnly(posix, 'linux');
  assert.deepEqual(posix, { PATH: '.:/usr/bin' });
});

// gate-no-stall fix round F9: spec 7 asks the guard for git only; a `claude` session gets the
// environment as it was before the strip, so its own tools find what they found before.
test('a claude session starts with the environment as it was before the strip', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const url = (file) => JSON.stringify(pathToFileURL(path.join(here, '..', '..', file)).href);
  const script = [
    `const { searchPathOnly } = await import(${url('scripts/pilot-branch.mjs')});`,
    `const { startPlain } = await import(${url('deck/run.mjs')});`,
    `delete process.env.${FLAG};`,
    "searchPathOnly(process.env, 'win32');",
    `if (process.env.${FLAG} !== '1') throw new Error('not stripped');`,
    `await startPlain(process.execPath, ['-e', 'process.stdout.write(process.env.${FLAG} ?? "unset")']);`,
  ].join('\n');
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'unset', 'the session does not inherit the guard');
});

test("a claude.exe planted in the repo is not the session's claude", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-claude-path-'));
  const before = process.cwd();
  t.after(() => {
    process.chdir(before); // out of the repo first, so Windows lets it go
    fs.rmSync(root, { recursive: true, force: true });
  });
  const installed = path.join(root, 'install');
  fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, 'claude.exe'), '');
  fs.writeFileSync(path.join(root, 'claude.exe'), ''); // in the repo, and reachable by '.' from it
  process.chdir(root);
  assert.equal(onSearchPath('claude.exe', { Path: `.;${installed}` }, 'win32'), path.join(installed, 'claude.exe'));
  assert.equal(onSearchPath('claude.exe', { Path: '.' }, 'win32'), null, 'no absolute entry has it: never the bare name');
});
