/**
 * Reads behind the guard (deck-token S5, spec 8; L4 redefined after A4): every request but the
 * three `OPEN_ROUTES` names wants the store's secret, as a Bearer header or as the page's cookie,
 * and every reading client this package ships sends it. No assertion prints a secret.
 */
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ensureSecret } from '../../hooks/lib/deck-secret.js';
import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { openCookie } from '../launch.mjs';
import { landing } from '../landing-wait.mjs';
import { ready } from '../schedule.mjs';
import { OPEN_ROUTES } from '../server-routes.mjs';
import { callTool, createDeckHttpServer } from '../server.mjs';
import { beginLanding, postItem, registerRun, settleLanding } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck, withTicket } from '../testUtils.mjs';
import { tickets } from '../tickets.mjs';

const REPO = 'D:/work/pilot-deck-reads';

/** A deck guarded as the daemon guards it, by the store's file, and every CLI pointed at it. */
async function guardedDeck(t) {
  tempDeck(t);
  const server = createDeckHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const port = server.address().port;
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(port);
  t.after(() => (before === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = before)));
  return { base: `http://127.0.0.1:${port}`, port, secret: ensureSecret() };
}

/** The status and body of a GET; a stream (`/events`) is cut once its head is in. */
async function get(base, pathname, headers = {}) {
  const stop = new AbortController();
  const response = await fetch(`${base}${pathname}`, { headers, redirect: 'manual', signal: stop.signal });
  if ((response.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
    stop.abort();
    return { status: response.status, text: '' };
  }
  return { status: response.status, text: await response.text() };
}

const readsOf = () => ['/', '/api/items', `/thread/${postItem({ kind: 'question', title: 'Read me', body: 'A read.' }).id}`, '/events'];

test('a read without the secret is refused', async (t) => {
  const { base, secret } = await guardedDeck(t);
  for (const pathname of readsOf()) {
    const { status, text } = await get(base, pathname);
    assert.equal(status, 401, `${pathname} bare`);
    assert.ok(!text.includes(secret), `${pathname}: the refusal holds no secret`);
  }
  const page = await get(base, '/');
  assert.match(page.text, /pilot deck/, 'the page is told how to open the deck');
  assert.match(JSON.parse((await get(base, '/api/items')).text).error, /deck\.secret/, 'the API names the file');
});

test('a read with either credential is served', async (t) => {
  const { base, port, secret } = await guardedDeck(t);
  const cookie = openCookie(port, secret).split(';')[0];
  for (const pathname of readsOf()) {
    assert.equal((await get(base, pathname, { authorization: `Bearer ${secret}` })).status, 200, `${pathname} with the Bearer header`);
    assert.equal((await get(base, pathname, { cookie })).status, 200, `${pathname} with the cookie`);
  }
  assert.equal((await get(base, '/api/items', { authorization: `Bearer ${'0'.repeat(64)}` })).status, 401, 'a wrong secret is no secret');
});

test('three routes stay open by name', async (t) => {
  const { base, secret } = await guardedDeck(t);
  assert.equal((await get(base, '/api/health')).status, 200, 'health answers bare');
  assert.equal((await get(base, '/ui/deck.mjs')).status, 200, 'a UI asset answers bare');
  assert.equal((await get(base, '/ui/favicon.svg')).status, 200, 'the icon answers bare');
  assert.equal((await get(base, `/open?key=${secret}`)).status, 200, 'the open file answers bare');

  for (const pathname of ['/api/no-such-route', '/ui/deck.css', '/ui/', '/api/health/more', '/open/more']) {
    assert.equal((await get(base, pathname)).status, 401, `${pathname} is guarded: no prefix is exempt`);
  }
  const post = { method: 'POST' };
  assert.equal(OPEN_ROUTES(post, '/api/health'), false, 'only a GET is exempt');
  assert.equal(OPEN_ROUTES(post, '/open'), false);
  assert.equal(OPEN_ROUTES({ method: 'HEAD' }, '/api/health'), false);
});

test('pilot tickets reads a guarded deck', async (t) => {
  await guardedDeck(t);
  const said = [];
  const code = await tickets({ cwd: REPO, say: (text) => said.push(text) });
  assert.equal(code, 0, 'the queue is read');
  assert.ok(said.join('').length > 0, 'and printed');
});

test('pilot landing and the record reader read a guarded deck', async (t) => {
  const { base } = await guardedDeck(t);

  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, ...withTicket({ pr: '#250', sha: '0305827' }, REPO, 'yellow') });
  beginLanding(gate.id, { worktree: 'D:/work/feat-x' });
  settleLanding(gate.id, { ok: true, sha: '0a1b2c3', line: 'landed feat/x on pilot at 0a1b2c3' });
  const out = [];
  const code = await landing(gate.id, { pollMs: 10, say: (line) => out.push(line), warn: () => {} });
  assert.equal(code, 0, 'pilot landing reads the landed state');
  assert.match(out.join(''), /landed feat\/x/);

  const run = registerRun({ repo: REPO, pid: process.pid });
  const ticket = postStored({ kind: KIND_TICKET, title: 'Scheduled', body: shapedTicketBody(), repo: REPO, sliceCount: 2, state: 'yellow' });
  callTool('deck_status', { run: run.id, slug: 'reads', ticket: ticket.id, slices: [{ slice: 'S1 one', state: 'integrated' }, { slice: 'S2 two', state: 'planned', after: ['S1'] }] });
  const said = [];
  const complaints = [];
  const answered = await ready(['--ticket', ticket.id, '--slots', '1'], { cwd: REPO, url: base, say: (line) => said.push(line), complain: (line) => complaints.push(line) });
  assert.deepEqual({ answered, said: said.join(''), complaints: complaints.join('') }, { answered: 0, said: 'S2 from feat\n', complaints: '' });
});
