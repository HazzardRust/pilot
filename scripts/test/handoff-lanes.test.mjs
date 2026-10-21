/**
 * `pilot handoff` names both lanes (idle-main-lane spec 4): the posted body ends with the
 * two lane lines exactly as the deck spelled them in `/api/record` `lanes`.
 */

// A home of its own, holding the deck secret `pilot handoff` sends (deck-token S2), never the user's.
import './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { ensureSecret } from '../../hooks/lib/deck-secret.js';

ensureSecret();
const { handoff } = await import('../handoff.mjs');

/** A deck answering `/api/record` with `answer` and remembering every post. */
async function stubDeck(t, answer) {
  const posts = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && url.pathname === '/api/record') return response.end(JSON.stringify(answer));
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

const record = { feature: 'the thing', slug: 'x', next: 'write the artefact' };
const yellow = { ticket: { id: 'itm_aaaaaaaaaaaa', title: 'a yellow ticket' } };

test('an empty planning lane with a red pick names the three lanes', async (t) => {
  const posts = await stubDeck(t, {
    record,
    lanes: { planning: 'planning: empty → next itm_abc123', concluding: 'concluding: empty', coPilot: 'co-pilot: itm_def456' },
  });
  const result = await handoff({ cwd: 'C:/scratch', env: {} });
  assert.equal(result.ok, true, result.line);
  assert.equal(posts[0].arguments.body, 'write the artefact\nplanning: empty → next itm_abc123\nconcluding: empty\nco-pilot: itm_def456');
});

test('a live planning ticket is named, on the co-pilot-only path too', async (t) => {
  const posts = await stubDeck(t, {
    record: null,
    yellow,
    lanes: { planning: 'planning: itm_abc123', concluding: 'concluding: empty', coPilot: 'co-pilot: none' },
  });
  const result = await handoff({ cwd: 'C:/scratch', env: {} });
  assert.equal(result.ok, true, result.line);
  const body = posts[0].arguments.body;
  assert.ok(body.endsWith('\nplanning: itm_abc123\nconcluding: empty\nco-pilot: none'), body);
});

test('a record without lanes posts as today', async (t) => {
  const posts = await stubDeck(t, { record });
  const result = await handoff({ cwd: 'C:/scratch', env: {} });
  assert.equal(result.ok, true, result.line);
  assert.equal(posts[0].arguments.body, 'write the artefact');
});
