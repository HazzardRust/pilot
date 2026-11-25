/**
 * S1 of user-pilot-branch: the pilot branch is named `<login>-pilot` from the host's signed-in user, stored
 * once in local git config, and created from the legacy `pilot` or the default tip (spec 1, 3, 5, 6, 8, 9;
 * L1-L8, L10, A2, A4). The suite pins `PILOT_BRANCH=pilot` (L7), so this file unsets it; every repository is a
 * scratch one, and the host is a fake.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

delete process.env.PILOT_BRANCH;

const { NO_NAME, LEGACY_PILOT, ensurePilotBranch, isPilotBase, landingSubjects, namePilotBranch, pilotBranch } = await import('../pilot-branch.mjs');
const { githubHost } = await import('../../deck/host-github.mjs');
const { gitlabHost } = await import('../../deck/host-gitlab.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const runnerIn = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const refs = (repo) => git(repo, 'for-each-ref', '--format=%(refname) %(objectname)');
const config = (repo) => git(repo, 'config', '--local', '--list');

/** A fake **Host** whose `login()` answers `login`, counting its calls. */
function hostWith(login) {
  const host = { calls: 0, login: () => { host.calls++; return login; } };
  return host;
}

/** origin.git holds `main` and the branches `extra` names, each one commit ahead of main; work clones it. */
function repos(t, key, extra = []) {
  return gitFixture(t, `pilot-branch-name:${key}`, (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main');
    for (const branch of extra) {
      git(work, 'commit', '-q', '--allow-empty', '-m', `on ${branch}`);
      git(work, 'push', '-q', 'origin', `HEAD:${branch}`);
      git(work, 'reset', '-q', '--hard', 'origin/main');
    }
    git(work, 'remote', 'set-head', 'origin', 'main');
    return { origin, work, main: git(origin, 'rev-parse', 'refs/heads/main') };
  });
}

test('the login names the branch and is stored', (t) => {
  const { work } = repos(t, 'plain');
  const host = hostWith('HazzardRust');
  assert.deepEqual(namePilotBranch({ git: runnerIn(work), host }), { name: 'hazzardrust-pilot', source: 'derived' });
  assert.equal(git(work, 'config', '--local', 'pilot.branch'), 'hazzardrust-pilot');
  assert.deepEqual(namePilotBranch({ git: runnerIn(work), host }), { name: 'hazzardrust-pilot', source: 'stored' });
  assert.equal(host.calls, 1, 'a second call reads no login');
  assert.equal(pilotBranch(runnerIn(work)), 'hazzardrust-pilot');
});

test('no login, no name, nothing written', (t) => {
  for (const host of [hostWith(null), null]) {
    const { origin, work } = repos(t, 'plain');
    const before = { config: config(work), work: refs(work), origin: refs(origin) };
    assert.throws(() => namePilotBranch({ git: runnerIn(work), host }), { message: NO_NAME });
    assert.throws(() => ensurePilotBranch({ git: runnerIn(work), host }), { message: NO_NAME });
    assert.throws(() => pilotBranch(runnerIn(work)), { message: NO_NAME });
    assert.deepEqual({ config: config(work), work: refs(work), origin: refs(origin) }, before, '0 config keys, 0 refs');
  }
});

test('a login git would not take is refused', (t) => {
  for (const login of ['a..b', 'x.', 'x.lock', 'a b', '-x', 'a/b', '']) {
    const { work } = repos(t, 'plain');
    const before = config(work);
    assert.throws(() => namePilotBranch({ git: runnerIn(work), host: hostWith(login) }), { message: NO_NAME }, login);
    assert.equal(config(work), before, `${JSON.stringify(login)}: nothing stored`);
  }
});

test('a hand-set name off the shape is refused', (t) => {
  for (const bad of ['main', 'feat/x', '-x-pilot', 'a..b-pilot', 'HZ-pilot']) {
    const { work } = repos(t, 'plain');
    git(work, 'config', '--local', 'pilot.branch', bad);
    assert.throws(() => pilotBranch(runnerIn(work)), /pilot\.branch/, bad);
  }
  const { work } = repos(t, 'plain');
  git(work, 'config', '--local', 'pilot.branch', 'pilot');
  assert.equal(pilotBranch(runnerIn(work)), LEGACY_PILOT, 'the legacy name stands');
});

test('the move copies the legacy tip', (t) => {
  const { origin, work } = repos(t, 'legacy', ['pilot']);
  const legacy = git(origin, 'rev-parse', 'refs/heads/pilot');
  const said = ensurePilotBranch({ git: runnerIn(work), host: hostWith('HazzardRust') });
  assert.deepEqual(said, { sha: legacy, created: true, from: 'pilot', runs: 'origin' });
  assert.equal(git(origin, 'rev-parse', 'refs/heads/hazzardrust-pilot'), legacy);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/pilot'), legacy, 'pilot unchanged');
  assert.deepEqual(ensurePilotBranch({ git: runnerIn(work), host: hostWith('HazzardRust') }), { sha: legacy, created: false, runs: 'origin' });
});

test('a later user starts from the default', (t) => {
  const { origin, work, main } = repos(t, 'moved', ['pilot', 'a-pilot']);
  const said = ensurePilotBranch({ git: runnerIn(work), host: hostWith('b') });
  assert.deepEqual(said, { sha: main, created: true, from: 'main', runs: 'origin' });
  assert.equal(git(origin, 'rev-parse', 'refs/heads/b-pilot'), main);
});

test('legacy reads: the base predicate and the landing subjects', () => {
  assert.equal(isPilotBase('hz-pilot', 'hz-pilot'), true);
  assert.equal(isPilotBase('pilot', 'hz-pilot'), true);
  assert.equal(isPilotBase('main', 'hz-pilot'), false);
  assert.equal(isPilotBase(undefined, 'hz-pilot'), false);
  assert.deepEqual(landingSubjects('feat/x', 'hz-pilot'), ['Merge feat/x into hz-pilot', 'Merge feat/x into pilot']);
});

test('the adapters read the login, and null when signed out', () => {
  const gh = [];
  assert.equal(githubHost((args) => { gh.push(args); return 'HazzardRust\n'; }).login(), 'HazzardRust');
  assert.deepEqual(gh, [['api', 'user', '--jq', '.login']]);
  assert.equal(githubHost(() => { throw Object.assign(new Error('not logged in'), { status: 1 }); }).login(), null);
  assert.equal(githubHost(() => '\n').login(), null);
  const glab = [];
  assert.equal(gitlabHost((args) => { glab.push(args); return JSON.stringify({ username: 'alice' }); }).login(), 'alice');
  assert.deepEqual(glab, [['api', 'user']]);
  assert.equal(gitlabHost(() => { throw Object.assign(new Error('not logged in'), { status: 1 }); }).login(), null);
  assert.equal(gitlabHost(() => JSON.stringify({ username: 7 })).login(), null);
});
