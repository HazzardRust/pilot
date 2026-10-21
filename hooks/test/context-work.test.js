#!/usr/bin/env node
/**
 * yellow-lane S12 (spec 16-19, A5): the guard advises the hand-off at
 * `WORK_CEILING` signed gates since the last hand-off, under the token mark.
 *
 * The deck counts them (`deck/work.mjs`, pinned in `deck/test/work.test.mjs`)
 * and serves them as `work` on `GET /api/record`; here the lane runs through
 * `post-tool.js` against a stub deck on an ephemeral port serving that record.
 * Nothing here reaches the deck on 4321.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const guard = require('../context-size-guard.js');
const postTool = require('../post-tool.js');

const REPO = path.join(os.tmpdir(), 'pilot-s12-work-repo');

test('the ceiling is two signed gates', function () {
  assert.strictEqual(guard.WORK_CEILING, 2);
});

// --- through post-tool.js, against a stub deck --------------------------------

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s12-work-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PILOT_DECK_PORT = '1';
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

async function stubDeck(t, record) {
  const calls = [];
  const server = http.createServer(function (request, response) {
    request.resume();
    request.on('end', function () {
      calls.push(request.method + ' ' + request.url);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(record));
    });
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(function () { server.closeAllConnections(); return new Promise(function (resolve) { server.close(resolve); }); });
  return calls;
}

function pilotAt(home, ctx) {
  fs.writeFileSync(path.join(home, '.claude', 'context-usage-state.json'),
    JSON.stringify({ ctx: ctx, session: null, weekly: null, session_id: 'sess-work' }), 'utf8');
  return { hook_event_name: 'PostToolUse', session_id: 'sess-work', cwd: REPO, tool_name: 'Bash' };
}

function lane(input) {
  return postTool.runModules(input, [{ file: './context-size-guard.js' }]);
}

test('at the ceiling under the token mark it advises', async function (t) {
  const home = scratchHome(t);
  const record = { record: null, work: { landings: 1, designs: 0, since: 'itm_handoff1' } };
  const calls = await stubDeck(t, record);
  const input = pilotAt(home, 5); // 50,000 tokens: far under every token mark

  assert.strictEqual(await lane(input), null, 'one signed gate is under the ceiling');
  record.work = { landings: '1', designs: '1', since: 'itm_handoff1' }; // '1' + '1' is '11', over the ceiling
  assert.strictEqual(await lane(input), null, 'counts that are not whole numbers say nothing');

  // The record serves 2 signed gate2s and 1 signed gate1 since the hand-off.
  record.work = { landings: 2, designs: 1, since: 'itm_handoff1' };
  const said = await lane(input);
  assert.ok(said, 'two landings and a design since the hand-off advise it');
  const out = JSON.stringify(said.payload);
  console.log(out);
  assert.match(out, /2 landings, 1 design since the last hand-off: hand off now if idle \(pilot handoff\)/);
  said.commit();

  assert.strictEqual(await lane(input), null, 'once per crossing');

  record.work = { landings: 2, designs: 0, since: 'itm_handoff2' };
  const again = await lane(input);
  assert.ok(again, 'a hand-off re-arms it, so the next crossing is said');
  assert.match(JSON.stringify(again.payload), /2 landings, 0 designs since the last hand-off/);
  again.commit();

  assert.strictEqual(await lane(Object.assign({}, input, { agent_id: 'aCREW1', agent_type: 'pilot:pilot-implementer' })), null,
    'a crew agent is never told');
  // The record route marks no reply delivered and posts nothing; a deck_read would do the first.
  const asked = '/api/record?repo=' + encodeURIComponent(REPO);
  assert.ok(calls.length > 0 && calls.every(function (call) { return call === 'GET ' + asked; }), 'only record reads: ' + calls);
});

test('a deck it cannot reach costs the pilot nothing', async function (t) {
  const home = scratchHome(t); // PILOT_DECK_PORT=1: nothing answers
  assert.strictEqual(await lane(pilotAt(home, 5)), null);
});
