/**
 * S10 of yellow-lane: friction rows survive the hand-off (spec 20).
 *
 * Two `deck_status` calls append friction rows to the record and the daemon mirrors
 * it to `docs/design/<slug>/run.json` in the feature worktree; `pilot handoff` then
 * commits that file. The committed run.json must hold every row from both calls.
 *
 * The store is this test's own, the repository a clone of a scratch bare origin, and the deck `pilot handoff` asks is a stub on a free port.
 */

import '../../deck/test/no-open.mjs';

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { tempDeck } from '../../deck/testUtils.mjs';

const { registerRun, recordFor } = await import('../../deck/store.mjs');
const { callTool } = await import('../../deck/server.mjs');
const { handoff } = await import('../handoff.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A clone of a scratch bare origin, on `feat/x`. */
function scratchRepo(t) {
  return gitFixture(t, 'handoff-friction:scratchRepo', buildScratchRepo);
}

function buildScratchRepo(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'feat/x', origin);
  git(root, 'clone', '-q', origin, work);
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  git(work, 'add', 'base.txt');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  return work;
}

/** The two calls `pilot handoff` makes, answered from this test's store. */
async function stubDeck(t, repo) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && request.url.startsWith('/api/record')) {
        return response.end(JSON.stringify({ record: recordFor(repo) }));
      }
      const text = 'Posted itm_0123456789ab to the deck.';
      return response.end(JSON.stringify({ content: [{ type: 'text', text }] }));
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

test('the hand-off commits them', async (t) => {
  tempDeck(t);
  const work = scratchRepo(t);
  const run = registerRun({ repo: work, pid: process.pid });
  const first = [{ agent: 'pilot-implementer', what: 'the suite takes four minutes', evidence: 'npm test: 241s', size: 4 }];
  const second = [{ kind: 'drain', what: 'the artefact read whole', size: 9 }];

  callTool('deck_status', { run: run.id, slug: 'x', worktree: work, slices: [], friction: first });
  callTool('deck_status', { run: run.id, slug: 'x', slices: [], friction: second });
  await stubDeck(t, work);
  const result = await handoff({ cwd: work, env: {} });

  assert.equal(result.ok, true, result.line);
  assert.equal(git(work, 'status', '--porcelain'), '', 'nothing is left uncommitted');
  const committed = JSON.parse(git(work, 'show', 'HEAD:docs/design/x/run.json'));
  assert.deepEqual(committed.friction, [...first, ...second], 'every row from both calls');
});
