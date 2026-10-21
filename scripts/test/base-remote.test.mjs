/**
 * S1 of pilot-fork: `pilot base` puts `pilot` on the run remote, or locally under `none`, and
 * says where (spec 1, 2, 3; L2, L7, L14). Each case runs against a scratch bare origin whose
 * `pilot` is ahead of `main`, plus a second bare remote; nothing reaches GitHub or a deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { base } = await import('../base.mjs');
const { ensurePilotBranch, pilotLineage } = await import('../pilot-branch.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const refs = (repo) => git(repo, 'for-each-ref', '--format=%(refname) %(objectname)');

/** origin.git holds `main` and a `pilot` one commit ahead; second.git is empty; work clones origin. */
function scratchRepos(t) {
  return gitFixture(t, 'base-remote:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'landed on pilot');
  git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  git(work, 'reset', '-q', '--hard', 'origin/main');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'remote', 'add', 'second', second);
  const pilotTip = git(origin, 'rev-parse', 'refs/heads/pilot');
  const inWork = (args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { origin, second, work, pilotTip, inWork };
}

async function printed(cwd) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text) });
  return { code, out: said.join(''), err: warned.join('') };
}

test("base creates pilot on the second remote from origin's pilot", (t) => {
  const { origin, second, work, pilotTip, inWork } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'second');
  const before = refs(origin);
  assert.deepEqual(ensurePilotBranch({ git: inWork }), { sha: pilotTip, created: true, from: 'origin pilot', runs: 'second' });
  assert.equal(git(second, 'rev-parse', 'refs/heads/pilot'), pilotTip);
  assert.equal(refs(origin), before, "origin's refs do not move");
  assert.deepEqual(ensurePilotBranch({ git: inWork }), { sha: pilotTip, created: false, runs: 'second' }, 'a second run finds it');
});

test('base under none creates a local pilot', (t) => {
  const { origin, second, work, pilotTip, inWork } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'none');
  const before = refs(origin);
  assert.deepEqual(ensurePilotBranch({ git: inWork }), { sha: pilotTip, created: true, from: 'origin pilot', runs: null });
  assert.equal(git(work, 'rev-parse', 'refs/heads/pilot'), pilotTip);
  assert.equal(refs(origin), before, 'nothing pushed to origin');
  assert.equal(refs(second), '', 'nothing pushed to second');
  assert.deepEqual(ensurePilotBranch({ git: inWork }), { sha: pilotTip, created: false, runs: null }, 'a second run finds it');
});

test('base seeds pilot from the default tip when origin has no pilot', (t) => {
  const { origin, second, work, inWork } = scratchRepos(t);
  git(origin, 'update-ref', '-d', 'refs/heads/pilot');
  git(work, 'config', 'pilot.remote', 'second');
  const main = git(origin, 'rev-parse', 'refs/heads/main');
  assert.deepEqual(ensurePilotBranch({ git: inWork }), { sha: main, created: true, from: 'main', runs: 'second' });
  assert.equal(git(second, 'rev-parse', 'refs/heads/pilot'), main);
  assert.equal(git(origin, 'for-each-ref', 'refs/heads/pilot'), '', 'origin gets no pilot');
});

test("base with the setting unset prints today's line", async (t) => {
  const { work } = scratchRepos(t);
  const { code, out } = await printed(work);
  assert.equal(code, 0);
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`);
});

test('base says where pilot is when the run remote is not origin', async (t) => {
  const { work, pilotTip } = scratchRepos(t);
  const short = git(work, 'rev-parse', '--short', pilotTip);
  git(work, 'config', 'pilot.remote', 'second');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${short} (created from origin pilot) on second\n`, err: '' });
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${short} on second\n`, err: '' });
  git(work, 'config', 'pilot.remote', 'none');
  assert.deepEqual(await printed(work), { code: 0, out: `base pilot ${short} (created from origin pilot) local\n`, err: '' });
});

test('base stops, naming the key, when pilot.remote is not a remote', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', '--upload-pack=x');
  const before = refs(origin);
  const { code, out, err } = await printed(work);
  assert.deepEqual({ code, out }, { code: 1, out: '' });
  assert.match(err, /^pilot base: pilot\.remote names "--upload-pack=x": not a remote name\n$/);
  assert.equal(refs(origin), before);
});

test("pilotLineage reads the run remote's pilot, or the local one under none", (t) => {
  const { work, pilotTip, inWork } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'second');
  const [upstream, local] = ['refs/remotes/second/pilot', 'refs/heads/pilot'];
  assert.deepEqual(pilotLineage(work, pilotTip), { upstream }, 'second has no pilot yet');
  ensurePilotBranch({ git: inWork });
  assert.deepEqual(pilotLineage(work, pilotTip), { upstream, tip: true, copies: 0 });
  assert.deepEqual(pilotLineage(work, 'main'), { upstream, tip: false, copies: 0 });
  git(work, 'config', 'pilot.remote', 'none');
  assert.deepEqual(pilotLineage(work, pilotTip), { upstream: local }, 'no local pilot yet');
  ensurePilotBranch({ git: inWork });
  assert.deepEqual(pilotLineage(work, pilotTip), { upstream: local, tip: true, copies: 0 });
});
