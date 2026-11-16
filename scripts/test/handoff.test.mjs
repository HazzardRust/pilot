/**
 * `pilot handoff` — the pilot's one call at the hard mark, after its one `deck_status`.
 *
 * The user asked for the hand-off not to be manual at all (2026-09-28): the pilot runs
 * one command that commits and pushes the run record in the feat worktree, posts the
 * one `handoff` item for this repository, and answers in one line; `pilot run` then types
 * `/clear` and the fresh session's first prompt as it already did. So the claims here are
 * about what reaches git and the deck, and what the one line says when it did not.
 *
 * Every case runs against a scratch bare origin and a stub deck on a port the operating
 * system hands out. Nothing here may post to the real deck: a live `pilot run` watching
 * a real repository would clear a real session on a `handoff` item.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { freePort } from '../../deck/testUtils.mjs';
import { isAuthorized } from '../../deck/server-wait.mjs';
import { ensureSecret, readSecret } from '../../hooks/lib/deck-secret.js';

// This home's deck secret, which `pilot handoff` sends and the stub's guard reads (deck-token S2).
ensureSecret();

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const { handoff } = await import('../handoff.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const REPO = path.join(os.tmpdir(), 'pilot-handoff-the-repo');

/** A bare origin and a clone of it on `feat/x`, with the deck's run.json written but not committed. */
function scratchWorktree(t) {
  return gitFixture(t, 'handoff:scratchWorktree', buildScratchWorktree);
}

function buildScratchWorktree(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  git(work, 'add', 'base.txt');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  fs.mkdirSync(path.join(work, 'docs', 'design', 'x'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs', 'design', 'x', 'run.json'), '{"slug":"x"}\n');
  return { origin, work };
}

/** A deck that answers the two calls the command makes, and remembers every post. */
async function stubDeck(t, record, { refusePost = false, yellow = null, coPilot = null } = {}) {
  const posts = [];
  const asked = [];
  const server = http.createServer((request, response) => {
    // The deck's guard (deck-token S2): what it would refuse is 401 here, so every case proves the secret is sent.
    if (!isAuthorized(request, readSecret())) {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: 'the deck wants its secret' }));
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && url.pathname === '/api/record') {
        asked.push(url.searchParams.get('repo'));
        return response.end(JSON.stringify({ record, yellow, coPilot }));
      }
      if (request.method === 'POST' && url.pathname === '/api/tool') {
        posts.push(JSON.parse(raw));
        if (refusePost) {
          response.statusCode = 400;
          return response.end(JSON.stringify({ error: 'no' }));
        }
        const text = 'Posted itm_0123456789ab to the deck. The human answers it at x.';
        return response.end(JSON.stringify({ content: [{ type: 'text', text }] }));
      }
      response.statusCode = 404;
      return response.end('{}');
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
  return { posts, asked };
}

const underWrapper = { PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: REPO };

test('under pilot run: the record is committed and pushed, one handoff item is posted, one line says so', async (t) => {
  const { origin, work } = scratchWorktree(t);
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', worktree: work, next: 'merge S3, then QA' });

  // The shell's directory may have drifted into a worktree; the wrapper's is the one it watches.
  const result = await handoff({ cwd: work, env: underWrapper, trailers: ['Claude-Session: s'] });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(deck.asked, [REPO], 'the record is asked for the directory the wrapper watches');
  assert.equal(git(work, 'status', '--porcelain'), '', 'nothing is left uncommitted');
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'chore(x): run record');
  assert.match(git(work, 'log', '-1', '--format=%B'), /Claude-Session: s/);
  assert.equal(git(origin, 'rev-parse', 'feat/x'), git(work, 'rev-parse', 'HEAD'), 'and it is pushed');

  assert.equal(deck.posts.length, 1, 'one item');
  const [{ name, arguments: args }] = deck.posts;
  assert.equal(name, 'deck_post');
  assert.equal(args.kind, 'handoff');
  assert.equal(args.repo, REPO, 'for the repository the wrapper watches, or no /clear is typed');
  assert.match(args.title, /the thing/);
  assert.equal(args.body, 'merge S3, then QA');

  assert.doesNotMatch(result.line, /\n/, 'one line');
  assert.match(result.line, /itm_0123456789ab/);
  assert.match(result.line, /pushed/);
  assert.match(result.line, /pilot run/);
});

test('pilot handoff is taken by a guarded deck', async (t) => {
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', next: 'write the artefact' });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, true, result.line);
  assert.deepEqual(deck.asked, [REPO], 'the record read was let through');
  assert.equal(deck.posts.length, 1, 'and the post');
  assert.match(result.line, /posted itm_0123456789ab/);
});

test('a record naming no worktree skips the commit cleanly and still hands off', async (t) => {
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', next: 'write the artefact' });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, true, result.line);
  assert.equal(deck.posts.length, 1);
  assert.match(result.line, /no worktree/);
  assert.match(result.line, /itm_0123456789ab/);
});

// clear-waits-co-pilot spec 6, A3: the line repeats the pause while the deck says a co-pilot is live.
const RUN = { feature: 'the thing', slug: 'x', next: 'write the artefact' };

test('a hand-off with a live co-pilot says to pause it', async (t) => {
  await stubDeck(t, RUN, { coPilot: { ticket: 'itm_7a5c0ffee123', live: true, at: '2026-10-07T10:00:00.000Z' } });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, true, result.line);
  assert.equal(
    result.line,
    'handed off: no worktree in the run record, so nothing committed; posted itm_0123456789ab; the co-pilot on itm_7a5c0ffee123 is live: send it the pause, deck_ticket release it on its hand-back; `pilot run` types `/clear` after that; stop here',
  );
});

test('with none, the line is as today', async (t) => {
  await stubDeck(t, RUN, { coPilot: { ticket: 'itm_7a5c0ffee123', live: false, at: '2026-10-07T10:00:00.000Z' } });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.match(result.line, /; posted itm_0123456789ab; `pilot run` types `\/clear` and the first prompt now; stop here$/);
});

test('a live co-pilot off the wrapper: pause it, then the user types /clear; a malformed ticket id is never repeated', async (t) => {
  await stubDeck(t, RUN, { coPilot: { ticket: 'itm_7a5c0ffee123', live: true, at: '2026-10-07T10:00:00.000Z' } });
  const off = await handoff({ cwd: REPO, env: {} });
  assert.match(off.line, /; posted itm_0123456789ab; the co-pilot on itm_7a5c0ffee123 is live: send it the pause, deck_ticket release it on its hand-back; not under `pilot run`, so nothing will type it: after that tell the user to type `\/clear`, and stop$/);

  await stubDeck(t, RUN, { coPilot: { ticket: 'x`; run rm', live: true, at: '2026-10-07T10:00:00.000Z' } });
  const bad = await handoff({ cwd: REPO, env: underWrapper });
  assert.match(bad.line, /; posted itm_0123456789ab; `pilot run` types `\/clear` and the first prompt now; stop here$/);
});

test('with nothing owning the terminal the line says so, so the user types /clear', async (t) => {
  for (const env of [{}, { PILOT_RUN_PID: '999999999', PILOT_RUN_REPO: REPO }]) {
    const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', next: 'n' });

    const result = await handoff({ cwd: REPO, env });

    assert.equal(result.ok, true, result.line);
    assert.equal(deck.posts.length, 1, 'the item is posted either way; the lane still hands it over');
    assert.equal(deck.posts[0].arguments.repo, REPO, 'off the wrapper the directory is the shell\'s own');
    assert.match(result.line, /not under `pilot run`/);
    assert.match(result.line, /type `\/clear`/);
  }
});

test('a failing push is named, and no handoff item is posted behind it', async (t) => {
  const { work } = scratchWorktree(t);
  git(work, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'pilot-handoff-no-such-origin.git'));
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, false);
  assert.equal(deck.posts.length, 0, 'a /clear after a lost record is the one thing this must not cause');
  assert.match(result.line, /^NOT handed off/);
  assert.match(result.line, /push failed/);
  assert.match(result.line, /committed locally at [0-9a-f]{7,}/);
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'chore(x): run record', 'the commit itself is kept');
});

test('a trailer that is not one Key: value line is refused before anything lands', async (t) => {
  const { work } = scratchWorktree(t);
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', worktree: work, next: 'n' });
  const result = await handoff({ cwd: REPO, env: underWrapper, trailers: ['A: b\nReviewed-by: x'] });
  assert.equal(result.ok, false);
  assert.equal(deck.posts.length, 0);
  assert.match(result.line, /^NOT handed off: trailer .* is not one "Key: value" line; no handoff item posted$/);
});

test('a failing commit is named, and no handoff item is posted behind it', async (t) => {
  const { work } = scratchWorktree(t);
  fs.writeFileSync(path.join(work, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const deck = await stubDeck(t, { feature: 'the thing', slug: 'x', worktree: work, next: 'n' });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, false);
  assert.equal(deck.posts.length, 0);
  assert.match(result.line, /^NOT handed off: the run record commit failed/);
});

test('a refused post after the record landed says the record landed', async (t) => {
  const { work } = scratchWorktree(t);
  await stubDeck(t, { feature: 'the thing', slug: 'x', worktree: work, next: 'n' }, { refusePost: true });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, false);
  assert.match(result.line, /^NOT handed off/);
  assert.match(result.line, /the deck refused/);
  assert.match(result.line, /already .*pushed/, 'so a retry is known to be safe and nothing looks lost');
});

test('no record, a gone worktree, or no deck: named, and nothing posted', async (t) => {
  const none = await stubDeck(t, null);
  const noRecord = await handoff({ cwd: REPO, env: underWrapper });
  assert.equal(noRecord.ok, false);
  assert.match(noRecord.line, /no run record/);
  assert.equal(none.posts.length, 0);

  const gone = await stubDeck(t, { slug: 'x', worktree: path.join(os.tmpdir(), 'pilot-handoff-gone'), next: 'n' });
  const goneWorktree = await handoff({ cwd: REPO, env: underWrapper });
  assert.equal(goneWorktree.ok, false);
  assert.match(goneWorktree.line, /worktree .* is gone/);
  assert.equal(gone.posts.length, 0);

  process.env.PILOT_DECK_PORT = String(PORT);
  const noDeck = await handoff({ cwd: REPO, env: underWrapper });
  assert.equal(noDeck.ok, false);
  assert.match(noDeck.line, /^NOT handed off: the deck/);
});

test('a main session holding only a co-pilot hands off with nothing to land (yellow-agent S6)', async (t) => {
  const yellow = {
    ticket: { id: 'itm_00aa11bb22cc', title: 'the yellow ticket' },
    plan: { artefact: 'docs/design/y/architecture.md', branch: 'feat/y', sha: 'abc1234', sliceCount: 1 },
    record: { worktree: path.join(os.tmpdir(), 'pilot-handoff-not-this-sessions'), next: 'n' },
  };
  const deck = await stubDeck(t, null, { yellow });

  const result = await handoff({ cwd: REPO, env: underWrapper });

  assert.equal(result.ok, true, result.line);
  assert.match(result.line, /^handed off: no run of this session's own, so nothing committed; posted itm_0123456789ab; `pilot run` types/);
  assert.equal(deck.posts.length, 1);
  const [{ arguments: args }] = deck.posts;
  assert.equal(args.kind, 'handoff');
  assert.equal(args.title, 'Handoff: co-pilot on the yellow ticket');
  assert.match(args.body, /no run of its own/);
  assert.match(args.body, /itm_00aa11bb22cc/);
  assert.doesNotMatch(JSON.stringify(args), /feat\/y|architecture|pilot-handoff-not-this-sessions/, 'only the ticket id and title are carried (L5)');
});

test('neither a record nor a yellow ticket: refused as before, nothing posted', async (t) => {
  const deck = await stubDeck(t, null, { yellow: { ticket: { id: 'not a ticket id', title: 't' } } });
  const result = await handoff({ cwd: REPO, env: underWrapper });
  assert.equal(result.ok, false);
  assert.equal(result.line, `NOT handed off: no run record for ${REPO}; call deck_status first; no handoff item posted`);
  assert.equal(deck.posts.length, 0);
});
