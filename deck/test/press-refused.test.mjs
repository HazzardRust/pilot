/**
 * A refused press lands on its thread (deck-press-feedback spec 1, 2, 3, 6; L1-L3, A2, ADR 0096):
 * under `Sec-Fetch-Mode: navigate` a refusal at `/reply`, `/close`, `/reopen` or `/dismiss-item`
 * is a 303 to the pressed item's own thread with the reason as `refused`, built from the stored
 * id and never from `back`. Anything else keeps today's 400. The thread page draws the reason,
 * escaped and capped, only for a same-origin GET.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, KIND_TICKET, SIGN_OFF, chosenOf } from '../items.mjs';
import { listItems, postItem, resolveItem } from '../store.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const NAVIGATE = { 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'same-origin' };
const reread = (id) => listItems().find((item) => item.id === id);

/** A gate2 whose ticket has one open blocking question, so its Sign off is refused (yellow-lane L3). */
function aWaitingGate2() {
  const ticket = postStored({ kind: KIND_TICKET, title: 'Asked', body: shapedTicketBody('Asked'), repo: REPO, sliceCount: 60, state: 'yellow' });
  takeLive(ticket.id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
  const question = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: ticket.id, blocking: true });
  return { ticket, question, gate };
}

/**
 * A form post as the browser makes it. `node:http` and not `fetch`: undici always sends
 * `Sec-Fetch-Mode: cors` and overwrites a `navigate` the caller sets.
 */
const press = (base, route, fields, headers = {}) =>
  new Promise((resolve, reject) => {
    const body = String(new URLSearchParams(fields));
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, ...headers },
    });
    request.on('response', (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location ?? null, text }));
    });
    request.on('error', reject);
    request.end(body);
  });

const landing = (answer) => new URL(answer.location, 'http://deck');

test('a navigation Sign off on a gate2 with an open question lands on its thread', async (t) => {
  const base = await deckOnAPort(t);
  const { ticket, question, gate } = aWaitingGate2();
  const answer = await press(base, '/reply', { id: gate.id, choice: SIGN_OFF }, NAVIGATE);
  assert.equal(answer.status, 303);
  const where = landing(answer);
  assert.equal(where.pathname, `/thread/${gate.id}`);
  assert.equal(where.hash, '#reply');
  assert.equal(where.searchParams.get('refused'), `gate2 ${gate.id} waits on 1 open blocking item(s) on ticket ${ticket.id}: ${question.id}; answer them or press Assume the default first`);
  assert.equal(chosenOf(reread(gate.id)), null, 'nothing stored');
});

test('a card press with back=/ that is refused still lands on the thread', async (t) => {
  const base = await deckOnAPort(t);
  const { gate } = aWaitingGate2();
  const answer = await press(base, '/reply', { id: gate.id, choice: SIGN_OFF, back: '/' }, NAVIGATE);
  assert.equal(answer.status, 303);
  assert.equal(landing(answer).pathname, `/thread/${gate.id}`);
});

test('the same press without Sec-Fetch-Mode navigate is the 400 it always was', async (t) => {
  const base = await deckOnAPort(t);
  const { ticket, question, gate } = aWaitingGate2();
  const answer = await press(base, '/reply', { id: gate.id, choice: SIGN_OFF });
  assert.equal(answer.status, 400);
  assert.equal(answer.text, `gate2 ${gate.id} waits on 1 open blocking item(s) on ticket ${ticket.id}: ${question.id}; answer them or press Assume the default first\n`);
});

test('an unknown id is a 400, never a redirect', async (t) => {
  const base = await deckOnAPort(t);
  for (const route of ['/reply', '/close', '/reopen', '/dismiss-item']) {
    const answer = await press(base, route, { id: 'itm_0123456789ab', text: 'hello', back: '/' }, NAVIGATE);
    assert.equal(answer.status, 400, route);
    assert.equal(answer.location, null, route);
  }
});

test('Close, Reopen and Dismiss refused under navigate land the same way', async (t) => {
  const base = await deckOnAPort(t);
  const open = postItem({ kind: KIND_QUESTION, title: 'Open', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A' });
  const shut = postItem({ kind: KIND_QUESTION, title: 'Shut', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A' });
  resolveItem(shut.id, 'A');
  const cases = [
    ['/close', shut, /is closed/],
    ['/reopen', open, /already open/],
    ['/dismiss-item', shut, /is closed/],
  ];
  for (const [route, item, reason] of cases) {
    const answer = await press(base, route, { id: item.id, back: '/' }, NAVIGATE);
    assert.equal(answer.status, 303, route);
    const where = landing(answer);
    assert.equal(where.pathname, `/thread/${item.id}`, route);
    assert.match(where.searchParams.get('refused') ?? '', reason, route);
  }
});

test('the thread page draws the reason escaped and capped, only same-origin', async (t) => {
  const base = await deckOnAPort(t);
  const { gate } = aWaitingGate2();
  const page = (reason, site, mode = 'navigate') =>
    new Promise((resolve, reject) => {
      const url = `${base}/thread/${gate.id}?refused=${encodeURIComponent(reason)}`;
      http.get(url, { headers: { 'sec-fetch-site': site, 'sec-fetch-mode': mode } }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => resolve(text));
      }).on('error', reject);
    });

  const scripted = await page('<script>alert(1)</script>', 'same-origin');
  assert.match(scripted, /<p class="refused" role="alert">The deck refused that press: &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/p>/);
  assert.doesNotMatch(scripted, /<script>alert/);

  const long = await page('x'.repeat(400), 'same-origin');
  assert.match(long, new RegExp(`The deck refused that press: x{300}<`));

  assert.doesNotMatch(await page('a crafted line', 'cross-site'), /role="alert"/);
  assert.doesNotMatch(await page('a crafted line', 'none'), /role="alert"/, 'a typed URL draws nothing');
  // The page's own refresh fetches `location.href`, same-origin, so a crafted link's query
  // would come back on it: only the navigation draws the line, and outside every live region.
  assert.doesNotMatch(await page('a crafted line', 'same-origin', 'cors'), /role="alert"/, 'the live refresh draws nothing');
  assert.doesNotMatch(scripted.match(/<div data-live="reply">.*?<\/div>/s)?.[0] ?? '', /refused/, 'not inside the reply region');
});
