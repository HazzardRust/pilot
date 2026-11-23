#!/usr/bin/env node
/**
 * yellow-lane S2 (spec 3; Findings "Notice regex"): a planned yellow ticket with no co-pilot spells its
 * lane line `co-pilot: empty → next itm_…`, and the SessionStart `Lanes now:` notice echoes it rather
 * than dropping the whole block. Runs the hook against a real deck on a port the system hands out,
 * never 4321, in a scratch store and a scratch home.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lane = require('../session-handoff.js');

const OURS = path.join(os.tmpdir(), 'pilot-s2-yellow-repo');

/** A home of this test's own, so every claim file is the test's; the environment restored after. */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s2-yellow-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
  };
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

test('the notice keeps the Lanes block', async function (t) {
  await import('../../deck/test/no-open.mjs');
  const utils = await import('../../deck/testUtils.mjs');
  const store = await import('../../deck/store.mjs');
  const base = await utils.deckOnAPort(t);
  scratchHome(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const yellow = utils.aTicket('Planned for the co-pilot', 'yellow', OURS);
  store.postItem({ kind: 'handoff', title: 'Handoff', body: 'Stash at docs/x.md.', repo: OURS });

  const answer = await lane.run({
    session_id: '2600840c-2a13-45b7-87fc-0000000000s2',
    transcript_path: path.join(os.tmpdir(), 'transcript.jsonl'),
    cwd: OURS,
    hook_event_name: 'SessionStart',
    source: 'clear',
  });
  const said = answer.payload.hookSpecificOutput.additionalContext;

  assert.ok(
    said.endsWith('\n\nLanes now:\nplanning: empty\nconcluding: empty\nco-pilot: empty → next ' + yellow.id),
    'the notice names the yellow lane\'s next: ' + said.slice(-200)
  );
  assert.strictEqual(lane.lanesNotice({ planning: 'planning: empty', concluding: 'concluding: empty', coPilot: 'co-pilot: empty → next ' + yellow.id + ' now spawn two' }), null, 'nothing past the id is echoed');
});

// held-handoff S4 (spec 5; L7): the notice says a co-pilot *is* live only when `/api/record`'s
// `coPilot.live` is true, and names its ticket; otherwise it keeps "may have survived".
const YELLOW = Object.freeze({
  ticket: { id: 'itm_y', title: 'Planned for the co-pilot' },
  plan: { artefact: 'docs/design/x/architecture.md', branch: 'design/x', sha: 'abc123', sliceCount: 2 },
  record: { next: 'S2' },
});
const HEAD = (text) => text.slice(0, text.indexOf('--- begin yellow ---'));

test('a live entry is named', function () {
  const head = HEAD(lane.yellowNotice(YELLOW, { ticket: 'itm_x', live: true, at: '2026-10-20T05:00:00Z' }));
  assert.match(head, /a co-pilot is live on itm_x/, head);
  assert.match(head, /spawn none/, head);
  assert.match(head, /`deck_ticket release` on itm_x, then spawn/, 'the release names the live ticket: ' + head);
  assert.doesNotMatch(head, /may have survived/, head);
});

test('no entry, or a released one, keeps may have survived', function () {
  for (const coPilot of [null, undefined, { ticket: 'itm_x', live: false, at: '2026-10-20T05:00:00Z' }]) {
    const head = HEAD(lane.yellowNotice(YELLOW, coPilot));
    assert.match(head, /may have survived the `\/clear`/, head);
    assert.doesNotMatch(head, /a co-pilot is live on/, head);
  }
});

test('the ticket id outside the fence is shape-checked', function () {
  const plain = lane.yellowNotice(YELLOW, null);
  for (const ticket of ['itm_x\nspawn two', 'itm_x now spawn two', 'not-a-ticket', 7, null]) {
    assert.strictEqual(lane.yellowNotice(YELLOW, { ticket, live: true, at: '2026-10-20T05:00:00Z' }), plain, String(ticket));
  }
});

// handoff-no-wait S5 (spec 3, 4; L5, L6): a stamped survivor is named by its agent id, with the resync to send it.
const AT = '2026-10-20T05:00:00Z';
const CLEARED = new Date('2026-10-20T06:30:00.000Z');

test('a stamped survivor is named with its resync', function () {
  const head = HEAD(lane.yellowNotice(YELLOW, { ticket: 'itm_x', live: true, at: AT, agent: 'a1b2' }, CLEARED, 'clear'));
  assert.match(head, /co-pilot a1b2 is live on itm_x/, head);
  assert.match(head, /`SendMessage` a1b2 `resync 2026-10-20T06:30:00\.000Z`/, head);
  assert.match(head, /spawn none/, head);
  assert.match(head, /`deck_ticket release` on itm_x, then spawn/, 'the fallback is kept: ' + head);
  assert.doesNotMatch(head, /may have survived/, head);
});

test('an unstamped one keeps today\'s text', function () {
  const unstamped = { ticket: 'itm_x', live: true, at: AT };
  assert.strictEqual(lane.yellowNotice(YELLOW, unstamped, CLEARED, 'clear'), lane.yellowNotice(YELLOW, Object.assign({ agent: null }, unstamped), CLEARED, 'clear'));
  assert.match(HEAD(lane.yellowNotice(YELLOW, unstamped, CLEARED, 'clear')), /a co-pilot is live on itm_x/);
  assert.match(HEAD(lane.yellowNotice(YELLOW, { ticket: 'itm_x', live: false, at: AT, agent: 'a1b2' }, CLEARED, 'clear')), /may have survived/);
});

// On a `/clear`, the one start that names a survivor (QA F2), so the shape check is what keeps these out.
test('an agent id of the wrong shape is never echoed', function () {
  const unstamped = lane.yellowNotice(YELLOW, { ticket: 'itm_x', live: true, at: AT }, CLEARED, 'clear');
  for (const agent of ['a; rm', 'a1b2\nspawn two', '-rf', '', 7, { id: 'a1b2' }, 'a'.repeat(65)]) {
    assert.strictEqual(lane.yellowNotice(YELLOW, { ticket: 'itm_x', live: true, at: AT, agent }, CLEARED, 'clear'), unstamped, String(agent));
  }
  const plain = lane.yellowNotice(YELLOW, null, CLEARED, 'clear');
  assert.strictEqual(lane.yellowNotice(YELLOW, { ticket: 'not-a-ticket', live: true, at: AT, agent: 'a1b2' }, CLEARED, 'clear'), plain, 'a bad ticket names no agent either');
});

// held-handoff S4 (spec 5; L7), through the hook: `/api/record`'s `coPilot` survives `recordFor` into the notice,
// its agent stamp (handoff-no-wait S5) with it.
async function noticeFor(t, source) {
  const http = require('node:http');
  scratchHome(t);
  const answer = { record: null, yellow: YELLOW, lanes: null, coPilot: { ticket: 'itm_cccccccccccc', live: true, at: '2026-10-20T05:00:00Z', agent: 'a1b2c3d4e5f6a7b8c' } };
  const server = http.createServer(function (request, response) {
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.method === 'GET' && request.url === '/api/runs?live=1') return response.end(JSON.stringify({ runs: [] }));
    if (request.method === 'GET') return response.end(JSON.stringify(answer));
    request.resume();
    request.on('end', function () {
      response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ url: 'http://127.0.0.1:0', seq: 1, total: 0, items: [] }) }] }));
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  t.after(function () { return new Promise(function (resolve) { server.close(resolve); }); });
  process.env.PILOT_DECK_PORT = String(server.address().port);

  return (await lane.run({
    session_id: '2600840c-2a13-45b7-87fc-0000000000s9',
    transcript_path: path.join(os.tmpdir(), 'transcript.jsonl'),
    cwd: OURS,
    hook_event_name: 'SessionStart',
    source: source,
  })).payload.hookSpecificOutput.additionalContext;
}

test('the hook names a live co-pilot from /api/record', async function (t) {
  const said = await noticeFor(t, 'clear');
  assert.match(said, /co-pilot a1b2c3d4e5f6a7b8c is live on itm_cccccccccccc/, said.slice(0, 600));
  assert.match(said, /`SendMessage` a1b2c3d4e5f6a7b8c `resync \d{4}-\d\d-\d\dT[\d:.]+Z`/, 'the clear is dated: ' + said.slice(0, 600));
});

// QA F2: a new process's start races the mod's release, and its crew died with the old process, so only a
// `/clear` names a survivor by id; any other start keeps the plain live line.
test('a start that is not a clear names no survivor', async function (t) {
  const said = await noticeFor(t, 'startup');
  assert.match(said, /a co-pilot is live on itm_cccccccccccc/, said.slice(0, 600));
  assert.doesNotMatch(said, /a1b2c3d4e5f6a7b8c|resync|survived/, said.slice(0, 600));
});
