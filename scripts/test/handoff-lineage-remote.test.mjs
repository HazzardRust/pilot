/**
 * pilot-fork S5 (spec 4; L1): `pilot handoff` pushes a run branch's record to the run remote,
 * or keeps it local under `pilot.remote none`, and the deck's gate1 lineage check reads the
 * run remote's `pilot`. Scratch bare repositories and a stub deck only; nothing reaches
 * GitHub or a real deck.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { assertOnPilotTip } from '../../deck/lineage.mjs';
import { DeckRefusal } from '../../deck/store.mjs';
import { ensureSecret } from '../../hooks/lib/deck-secret.js';

// The fake home's deck secret, which `pilot handoff` sends (deck-token S2).
ensureSecret();
const { handoff } = await import('../handoff.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** `origin.git` with `main` and `pilot`, `second.git` as the remote `second`, and a work clone. */
function scratchRepos(t) {
  return gitFixture(t, 'handoff-lineage-remote:scratchRepos', buildScratchRepos);
}

function buildScratchRepos(root) {
  const origin = path.join(root, 'origin.git');
  const second = path.join(root, 'second.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'init', '-q', '--bare', '-b', 'main', second);
  git(root, 'clone', '-q', origin, work);
  git(work, 'remote', 'add', 'second', second);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
  return { origin, second, work };
}

/** `branch` checked out in `work` with the deck's run.json written but not committed. */
function recordOn(work, branch) {
  git(work, 'checkout', '-q', '-b', branch);
  fs.mkdirSync(path.join(work, 'docs', 'design', 'x'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs', 'design', 'x', 'run.json'), '{"slug":"x"}\n');
}

/** A deck that hands back `record` and takes the one post. */
async function stubDeck(t, record) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url.startsWith('/api/record')) return response.end(JSON.stringify({ record }));
      return response.end(JSON.stringify({ content: [{ type: 'text', text: 'Posted itm_0123456789ab.' }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
    server.close();
  });
}

const branches = (bare) => git(bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads');

test("a design branch's record goes to the run remote", async (t) => {
  const { origin, second, work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'second');
  recordOn(work, 'design/x');
  await stubDeck(t, { slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /record pushed to second/);
  assert.equal(git(second, 'rev-parse', 'design/x'), git(work, 'rev-parse', 'HEAD'));
  assert.doesNotMatch(branches(origin), /design\/x/, 'origin lists no design/x');
});

test('under none a design record stays local', async (t) => {
  const { origin, second, work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'none');
  recordOn(work, 'design/x');
  await stubDeck(t, { slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /record committed locally \(pilot\.remote none\)/);
  assert.equal(git(work, 'status', '--porcelain'), '', 'the record is committed');
  assert.doesNotMatch(branches(origin), /design\/x/);
  assert.equal(branches(second), '');
});

test('a feat/ record still goes to origin under a second run remote', async (t) => {
  const { origin, second, work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'second');
  recordOn(work, 'feat/x');
  await stubDeck(t, { slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /record pushed to origin/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'));
  assert.equal(branches(second), '');
});

test('a feat/ record still goes to origin under none', async (t) => {
  const { origin, work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'none');
  recordOn(work, 'feat/x');
  await stubDeck(t, { slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /record pushed to origin/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'));
});

test('a bad pilot.remote refuses the hand-off before anything is committed', async (t) => {
  const { work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'nowhere');
  recordOn(work, 'design/x');
  await stubDeck(t, { slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT handed off: pilot\.remote names "nowhere": not a remote here/);
  assert.match(git(work, 'status', '--porcelain'), /docs\//, 'the record is left uncommitted');
});

const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));

test('the gate1 lineage reads the local pilot under none', (t) => {
  const { work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'none');
  git(work, 'branch', 'pilot', 'origin/pilot');
  git(work, 'checkout', '-q', '-b', 'design/x', 'pilot');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'docs');
  assert.doesNotThrow(() => assertOnPilotTip(work, 'design/x'), 'a design branch cut from the local pilot passes');

  git(work, 'checkout', '-q', 'pilot');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'pilot moves');
  assert.throws(() => assertOnPilotTip(work, 'design/x'), refused('design/x', "is not on pilot's tip", 'git rebase pilot)'));

  git(work, 'checkout', '-q', 'design/x');
  git(work, 'branch', '-D', 'pilot');
  assert.throws(() => assertOnPilotTip(work, 'design/x'), refused('a gate1 needs the pilot base:', 'has no pilot;'));
});

test('the gate1 lineage names the run remote pilot when it is missing', (t) => {
  const { work } = scratchRepos(t);
  git(work, 'config', 'pilot.remote', 'second');
  assert.throws(() => assertOnPilotTip(work, 'main'), refused('has no second/pilot;', 'git fetch second pilot'));
});
