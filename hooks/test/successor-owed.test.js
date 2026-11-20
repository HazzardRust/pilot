#!/usr/bin/env node
/**
 * crew-handoff-trace S6 (spec 4; §3.1 C3): an open crew-handoff whose ticket is open, yellow and held by no live
 * co-pilot is owed a successor, and a fresh session is told so in the owed block, the ticket as the row's line.
 * The deck's rule is ESM, imported; the hook runs against a stub deck on a port the system hands out.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const lane = require('../session-handoff.js');

const REPO = path.join(os.tmpdir(), 'pilot-s6-successor-repo');
const OTHER = path.join(os.tmpdir(), 'pilot-s6-other-repo');
const deckRule = (name) => import('../../deck/' + name);

const aTicket = (id, state, more) => Object.assign({ id: id, kind: 'ticket', title: 'Ticket ' + id, repo: REPO, state: state }, more);
const aCrewHandoff = (id, ticket, more) => Object.assign({
  id: id, kind: 'crew-handoff', title: 'Handoff: pilot-co-pilot on ' + ticket + ' paused itself', repo: REPO, ticket: ticket,
}, more);

test('an open crew-handoff with no live co-pilot is owed', async function () {
  const { successorOwedOf } = await deckRule('crew-handoff.mjs');
  const items = [aTicket('itm_aaaaaaaaaaaa', 'yellow'), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa')];

  assert.deepStrictEqual(successorOwedOf(items, REPO, null).map((item) => item.id), ['itm_bbbbbbbbbbbb']);
  assert.deepStrictEqual(successorOwedOf(items, REPO, { ticket: 'itm_aaaaaaaaaaaa', live: false }).map((item) => item.id), ['itm_bbbbbbbbbbbb']);
  assert.deepStrictEqual(successorOwedOf(items, REPO, { ticket: 'itm_aaaaaaaaaaaa', live: true }), [], 'its ticket\'s co-pilot is live');
  assert.deepStrictEqual(successorOwedOf(items, REPO, { ticket: 'itm_cccccccccccc', live: true }).length, 1, 'another ticket\'s co-pilot is live');
});

test('a closed or another repo\'s item is not owed', async function () {
  const { successorOwedOf } = await deckRule('crew-handoff.mjs');
  const closed = '2026-11-19T09:14:44.000Z';
  const cases = [
    ['a closed crew-handoff', [aTicket('itm_aaaaaaaaaaaa', 'yellow'), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa', { resolvedAt: closed })]],
    ['another repo\'s crew-handoff', [aTicket('itm_aaaaaaaaaaaa', 'yellow'), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa', { repo: OTHER })]],
    ['another repo\'s ticket', [aTicket('itm_aaaaaaaaaaaa', 'yellow', { repo: OTHER }), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa')]],
    ['a closed ticket', [aTicket('itm_aaaaaaaaaaaa', 'yellow', { resolvedAt: closed }), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa')]],
    ['a red ticket', [aTicket('itm_aaaaaaaaaaaa', 'red'), aCrewHandoff('itm_bbbbbbbbbbbb', 'itm_aaaaaaaaaaaa')]],
    ['no ticket field', [aTicket('itm_aaaaaaaaaaaa', 'yellow'), aCrewHandoff('itm_bbbbbbbbbbbb', undefined)]],
  ];
  for (const [what, items] of cases) assert.deepStrictEqual(successorOwedOf(items, REPO, null), [], what);
});

test('a session started on 11-19\'s state would have been told', async function () {
  const { owedThreadsOf } = await deckRule('owed.mjs');
  // §3.1 at 08:08:57: itm_64084fb89990 released at 08:08:31 with no successor, its crew-handoff still open (no S5 close),
  // itm_3997fa784e4b planned next, the pilot's own handoff just posted.
  const items = [
    aTicket('itm_64084fb89990', 'yellow', { postedAt: '2026-11-18T20:00:00.000Z' }),
    aTicket('itm_3997fa784e4b', 'red', { postedAt: '2026-11-18T21:00:00.000Z' }),
    aCrewHandoff('itm_7df7fdd3e4a3', 'itm_64084fb89990', { postedAt: '2026-11-19T07:29:01.000Z' }),
    { id: 'itm_fa7aaaa382a7', kind: 'handoff', title: 'Handoff: handoff-cache', repo: REPO, postedAt: '2026-11-19T08:08:47.000Z' },
  ];

  const owed = owedThreadsOf(items, REPO, { ticket: 'itm_64084fb89990', live: false });

  assert.deepStrictEqual(owed.filter((o) => o.why === 'successor owed'),
    [{ id: 'itm_7df7fdd3e4a3', line: 'itm_64084fb89990', why: 'successor owed' }]);
  assert.deepStrictEqual(owedThreadsOf(items, REPO, { ticket: 'itm_64084fb89990', live: true }).filter((o) => o.why === 'successor owed'), []);
});

/** A home of this test's own; the environment restored after. */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s6-successor-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.CLAUDE_PROJECT_DIR;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
}

/** A stub deck: `deck_read` answers no items, `/api/runs` none live, `/api/record` the given answer. */
async function aStubDeck(t, answer) {
  scratchHome(t);
  const server = http.createServer(function (request, response) {
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.method === 'GET' && request.url === '/api/runs?live=1') return response.end(JSON.stringify({ runs: [] }));
    if (request.method === 'GET') return response.end(JSON.stringify(answer));
    request.resume();
    request.on('end', function () {
      const text = JSON.stringify({ url: 'http://127.0.0.1:0', seq: 1, total: 0, items: [] });
      response.end(JSON.stringify({ content: [{ type: 'text', text: text }] }));
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  t.after(function () { return new Promise(function (resolve) { server.close(resolve); }); });
  process.env.PILOT_DECK_PORT = String(server.address().port);
}

test('a fresh session hears it', async function (t) {
  const owed = [{ id: 'itm_7df7fdd3e4a3', line: 'itm_64084fb89990', why: 'successor owed' }];
  await aStubDeck(t, { record: null, yellow: null, lanes: null, owed: owed });

  const answer = await lane.run({
    session_id: '2600840c-2a13-45b7-87fc-0000000000s6', transcript_path: path.join(os.tmpdir(), 'transcript.jsonl'),
    cwd: REPO, hook_event_name: 'SessionStart', source: 'startup',
  });

  assert.ok(answer, 'a start with only a successor owed still speaks');
  const said = answer.payload.hookSpecificOutput.additionalContext;
  assert.ok(said.endsWith('--- begin owed ---\nitm_7df7fdd3e4a3 successor owed: "itm_64084fb89990"\n--- end owed ---'), said);
  const told = said.slice(0, said.indexOf('--- begin owed ---'));
  assert.ok(told.includes('`deck_ticket co-pilot`'), 'the grant command is named outside the fence');
});

// The route serves the rule with this directory's co-pilot: none while it is live, the row once it is released.
test('the record route owes a successor only while no co-pilot holds the ticket', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const { deckOnAPort, postStored, shapedTicketBody } = await import('../../deck/testUtils.mjs');
  const base = await deckOnAPort(t);
  const tool = async (name, args) => (await (await fetch(base + '/api/tool', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, arguments: args }),
  })).json()).content?.[0]?.text;
  const owedNow = async () => (await (await fetch(base + '/api/record?repo=' + encodeURIComponent(REPO))).json()).owed
    .filter((o) => o.why === 'successor owed');
  const ticket = postStored({ kind: 'ticket', title: 'paused', body: shapedTicketBody('paused'), repo: REPO, sliceCount: 7, state: 'yellow' });
  assert.match(await tool('deck_ticket', { id: ticket.id, action: 'co-pilot' }), /live/);
  const { id: unused, ...shape } = aCrewHandoff('', ticket.id);
  const handoff = postStored(shape);

  assert.deepStrictEqual(await owedNow(), [], 'its co-pilot is live');
  await tool('deck_ticket', { id: ticket.id, action: 'release' });
  assert.deepStrictEqual(await owedNow(), [{ id: handoff.id, line: ticket.id, why: 'successor owed' }]);
});

test('a successor owed row whose line is not a ticket id is not echoed', function () {
  assert.strictEqual(lane.owedNotice([{ id: 'itm_7df7fdd3e4a3', line: 'Ship it now', why: 'successor owed' }]), null);
});
