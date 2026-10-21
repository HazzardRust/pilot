/**
 * `pilot handoff` and the threads the pilot owes (yellow-lane spec 9, 10; A3): it refuses before
 * landing anything while a thread is `unanswered`, and the posted item carries each `promised`
 * thread exactly as `/api/record` `owed` served it. Whatever the deck's rule for owed, these hold.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { ensureSecret } from '../../hooks/lib/deck-secret.js';

// The fake home's deck secret, which `pilot handoff` sends (deck-token S2).
ensureSecret();
const { handoff } = await import('../handoff.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository on `feat/x` with the deck's run.json written but not committed. */
function scratchWorktree(t) {
  return gitFixture(t, 'handoff-owed:scratchWorktree', buildScratchWorktree);
}

function buildScratchWorktree(work) {
  git(work, 'init', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(work, 'base.txt'), 'base\n');
  git(work, 'add', 'base.txt');
  git(work, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(work, 'docs', 'design', 'x'), { recursive: true });
  fs.writeFileSync(path.join(work, 'docs', 'design', 'x', 'run.json'), '{"slug":"x"}\n');
  return work;
}

/** A deck answering `/api/record` with `answer()` and remembering every post. */
async function stubDeck(t, answer) {
  const posts = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && url.pathname === '/api/record') return response.end(JSON.stringify(answer()));
      if (request.method === 'POST' && url.pathname === '/api/tool') {
        posts.push(JSON.parse(raw));
        return response.end(JSON.stringify({ content: [{ type: 'text', text: 'Posted itm_0123456789ab to the deck.' }] }));
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
  return posts;
}

const unanswered = { id: 'itm_aaaa11112222', line: 'can you also check the rail?', why: 'unanswered' };

test('an unanswered chat refuses', async (t) => {
  const work = scratchWorktree(t);
  const posts = await stubDeck(t, () => ({ record: { feature: 'f', slug: 'x', worktree: work, next: 'n' }, owed: [unanswered] }));
  const head = git(work, 'rev-parse', 'HEAD');

  const result = await handoff({ cwd: work, env: {}, trailers: ['Claude-Session: s'] });

  assert.equal(result.ok, false, result.line);
  assert.equal(
    result.line,
    'NOT handed off: user thread(s) unanswered: itm_aaaa11112222; reply first; no handoff item posted',
  );
  assert.equal(git(work, 'rev-parse', 'HEAD'), head, 'nothing is committed');
  assert.match(git(work, 'status', '--porcelain'), /\?\? docs\//, 'the record is left as the deck wrote it');
  assert.equal(posts.length, 0, 'nothing is posted');
});

test('every unanswered id is named, a promise beside them does not let it through', async (t) => {
  const promised = { id: 'itm_cccc55556666', line: 'later', why: 'promised' };
  const second = { id: 'itm_dddd77778888', line: 'and this?', why: 'unanswered' };
  const posts = await stubDeck(t, () => ({ record: { feature: 'f', slug: 'x', next: 'n' }, owed: [promised, unanswered, second] }));

  const result = await handoff({ cwd: 'C:/scratch', env: {} });

  assert.equal(result.ok, false, result.line);
  assert.match(result.line, /unanswered: itm_aaaa11112222, itm_dddd77778888; reply first/);
  assert.equal(posts.length, 0);
});

test('answered, it posts', async (t) => {
  let owed = [unanswered];
  const posts = await stubDeck(t, () => ({ record: { feature: 'f', slug: 'x', next: 'n' }, owed }));
  assert.equal((await handoff({ cwd: 'C:/scratch', env: {} })).ok, false);
  assert.equal(posts.length, 0, 'refused first');

  owed = []; // the pilot has replied
  const result = await handoff({ cwd: 'C:/scratch', env: {} });

  assert.equal(result.ok, true, result.line);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].arguments.body, 'n');
});

test('a promised thread rides the item', async (t) => {
  const promised = { id: 'itm_bbbb33334444', line: "I'll look at the rail after S3", why: 'promised' };
  const posts = await stubDeck(t, () => ({
    record: { feature: 'f', slug: 'x', next: 'n' },
    owed: [promised],
    lanes: { planning: 'planning: itm_abc123', concluding: 'concluding: empty', coPilot: 'co-pilot: none' },
  }));

  const result = await handoff({ cwd: 'C:/scratch', env: {} });

  assert.equal(result.ok, true, result.line);
  assert.equal(
    posts[0].arguments.body,
    "n\nOwed: itm_bbbb33334444 promised: I'll look at the rail after S3\nplanning: itm_abc123\nconcluding: empty\nco-pilot: none",
  );
});

test('an owed list the handoff cannot read refuses rather than letting a thread through', async (t) => {
  for (const owed of [null, { id: 'itm_aaaa11112222' }, [{ id: 'itm_aaaa11112222', why: 'Unanswered' }], [{ id: 42, why: 'unanswered' }], ['x']]) {
    const posts = await stubDeck(t, () => ({ record: { feature: 'f', slug: 'x', next: 'n' }, owed }));
    const result = await handoff({ cwd: 'C:/scratch', env: {} });
    assert.equal(result.ok, false, JSON.stringify(owed));
    assert.equal(result.line, 'NOT handed off: the deck sent an owed list this handoff cannot read; no handoff item posted');
    assert.equal(posts.length, 0);
  }
});
