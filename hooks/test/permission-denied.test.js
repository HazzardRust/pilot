#!/usr/bin/env node
/**
 * gate-no-stall S1, spec 3 (L1-L4, L9): a call auto mode denies to a pilot lane, in a
 * directory with a live run, becomes one blocked item on the deck within that hook turn.
 *
 * `onDenied` is the `PermissionDenied` hook; `postBlocked` is the one place a blocked step
 * becomes a deck item. The first test runs the real deck client against a fake deck on a
 * free port, so `filedTicket` and the post go over HTTP as they do for real; the rest inject a
 * deck. Nothing here reaches the live deck on 4321, and every claim directory is scratch.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const { onDenied } = require('../permission-denied.js');
const { postBlocked } = require('../lib/blocked.js');

const REPO = path.join(os.tmpdir(), 'pilot-blocked-repo');
/** A claim holds its step this long (L3). */
const WINDOW_MS = 10 * 60 * 1000;

function scratchClaims(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-blocked-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** The event as Claude Code sends it when auto mode denies a Bash call. */
function denial(extra) {
  return {
    session_id: 'sess-1',
    cwd: REPO,
    permission_mode: 'auto',
    hook_event_name: 'PermissionDenied',
    tool_name: 'Bash',
    tool_input: { command: 'gh pr ready 576' },
    tool_use_id: 'toolu_1',
    reason: 'Marking a PR ready is outside the ticket the user gave',
    agent_type: 'pilot:pilot',
    ...extra,
  };
}

/** A deck injected as an object: one live run in REPO unless told otherwise, and every post kept. */
function fakeDeck({ live = true, ticket: ticket = { id: 'itm_ticket1' } } = {}) {
  const posts = [];
  return {
    posts,
    runs: async () => ({ runs: live ? [{ repo: REPO, pid: 1 }] : [] }),
    filedTicket: async () => ticket,
    post: async (args) => {
      posts.push(args);
      return { content: [{ type: 'text', text: 'Posted itm_blk' + posts.length + ' to the deck.' }] };
    },
  };
}

function step(extra) {
  return { repo: REPO, command: 'gh pr ready 576', reason: 'outside the ticket', agent: 'pilot:pilot', session: 'sess-1', ...extra };
}

/** A port nothing listens on: bound by the OS, then closed. */
async function closedPort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function pointDeckAt(t, port) {
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(port);
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
  });
}

test('a pilot session\'s denial in a live run posts one blocking item', async (t) => {
  const posts = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      let answer = { error: 'no such route' };
      let status = 404;
      if (request.method === 'GET' && url.pathname === '/api/runs') {
        [status, answer] = [200, { runs: [{ repo: REPO, pid: process.pid }] }];
      } else if (request.method === 'GET' && url.pathname === '/api/tickets' && url.searchParams.get('repo') === REPO) {
        [status, answer] = [200, { live: { id: 'itm_live', title: 'the live ticket' }, red: [], filed: { id: 'itm_live' } }];
      } else if (request.method === 'POST' && url.pathname === '/api/tool') {
        const call = JSON.parse(raw);
        posts.push(call);
        [status, answer] = [200, { content: [{ type: 'text', text: 'Posted itm_blocked to the deck.' }] }];
      }
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  pointDeckAt(t, server.address().port);

  const out = await onDenied(denial(), { claims: scratchClaims(t), env: {} });

  assert.strictEqual(out, null, 'a denial stays a denial: the hook never answers retry');
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].name, 'deck_post');
  const item = posts[0].arguments;
  assert.strictEqual(item.kind, 'question');
  assert.strictEqual(item.blocking, true);
  assert.strictEqual(item.ticket, 'itm_live');
  assert.strictEqual(item.title, 'Blocked: gh pr ready 576');
  assert.match(item.body, /gh pr ready 576/);
  assert.match(item.body, /Marking a PR ready is outside the ticket the user gave/);
  assert.match(item.body, /pilot:pilot/);
  assert.deepStrictEqual(item.options, ['I ran it', 'Skip it']);
  assert.strictEqual(item.recommended, 'Skip it');
  assert.strictEqual(item.repo, REPO);
});

test('the same command denied again posts nothing', async (t) => {
  const deck = fakeDeck();
  const claims = scratchClaims(t);
  assert.strictEqual(await postBlocked(step(), { deck, claims }), 'itm_blk1');
  assert.strictEqual(await postBlocked(step(), { deck, claims }), null);
  assert.strictEqual(deck.posts.length, 1);
  // Another command, or the same one in another session, is a step of its own.
  assert.strictEqual(await postBlocked(step({ command: 'git push origin main' }), { deck, claims }), 'itm_blk2');
  assert.strictEqual(await postBlocked(step({ session: 'sess-2' }), { deck, claims }), 'itm_blk3');
});

test('a crew agent\'s denial posts too, another plugin\'s agent does not', async (t) => {
  const crew = fakeDeck();
  await onDenied(denial({ agent_id: 'a1', agent_type: 'pilot:pilot-qa' }), { deck: crew, claims: scratchClaims(t), env: {} });
  assert.strictEqual(crew.posts.length, 1);
  assert.match(crew.posts[0].body, /pilot:pilot-qa/);

  const other = fakeDeck();
  for (const extra of [
    { agent_id: 'a2', agent_type: 'other:agent' },
    { agent_id: 'a3', agent_type: 'Explore' },
    { agent_type: undefined },
    { agent_type: 'other:pilot' },
  ]) {
    const out = await onDenied(denial(extra), { deck: other, claims: scratchClaims(t), env: {} });
    assert.strictEqual(out, null);
  }
  assert.strictEqual(other.posts.length, 0);
});

test('no live run, or a deck that does not answer, posts nothing and throws nothing', async (t) => {
  const idle = fakeDeck({ live: false });
  assert.strictEqual(await postBlocked(step(), { deck: idle, claims: scratchClaims(t) }), null);
  assert.strictEqual(idle.posts.length, 0);

  const down = { runs: () => Promise.reject(new Error('ECONNREFUSED')), filedTicket: async () => null, post: async () => assert.fail('posted') };
  assert.strictEqual(await postBlocked(step(), { deck: down, claims: scratchClaims(t) }), null);

  const refusing = fakeDeck();
  refusing.post = () => Promise.reject(new Error('the deck refused it'));
  const claims = scratchClaims(t);
  assert.strictEqual(await postBlocked(step(), { deck: refusing, claims }), null);
  // A post that failed is not claimed: the next denial of that command may post.
  const working = fakeDeck();
  assert.strictEqual(await postBlocked(step(), { deck: working, claims }), 'itm_blk1');

  // The real client against a port nothing listens on.
  pointDeckAt(t, await closedPort());
  assert.strictEqual(await postBlocked(step(), { claims: scratchClaims(t) }), null);
});

test('no live ticket posts a plain question', async (t) => {
  const deck = fakeDeck({ ticket: null });
  assert.strictEqual(await postBlocked(step(), { deck, claims: scratchClaims(t) }), 'itm_blk1');
  assert.strictEqual(deck.posts.length, 1);
  const item = deck.posts[0];
  assert.strictEqual(item.kind, 'question');
  assert.ok(!('ticket' in item), 'no ticket to name');
  assert.ok(!('blocking' in item), 'a blocking question needs a ticket');
});

test('a tool other than Bash is named by its tool name', async (t) => {
  const deck = fakeDeck();
  await onDenied(
    denial({ tool_name: 'mcp__github__merge_pull_request', tool_input: { pull_number: 576 } }),
    { deck, claims: scratchClaims(t), env: {} },
  );
  assert.strictEqual(deck.posts.length, 1);
  assert.strictEqual(deck.posts[0].title, 'Blocked: mcp__github__merge_pull_request');
});

test('hooks.json registers the hook under PermissionDenied for every tool', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks.json'), 'utf8'));
  const lanes = manifest.hooks.PermissionDenied;
  assert.strictEqual(lanes.length, 1);
  assert.strictEqual(lanes[0].id, 'denied:any:blocked-item');
  assert.strictEqual(lanes[0].matcher, undefined, 'no matcher: a denial of any tool is a blocked step');
  assert.match(lanes[0].hooks[0].command, /hooks\/permission-denied\.js/);
  assert.strictEqual(lanes[0].hooks[0].timeout, 5);
});

test('a hook killed between its claim and its post does not hold the step for good', async (t) => {
  const claims = scratchClaims(t);
  const hung = fakeDeck();
  hung.post = () => new Promise(() => {}); // the deck never answers, and the harness kills the hook
  postBlocked(step(), { deck: hung, claims });
  await new Promise((resolve) => setImmediate(resolve));
  const later = fakeDeck();
  assert.strictEqual(await postBlocked(step(), { deck: later, claims }), null, 'still in flight: not posted twice');
  assert.strictEqual(await postBlocked(step(), { deck: later, claims, now: () => Date.now() + 120000 }), null, 'within the window: held');
  assert.strictEqual(await postBlocked(step(), { deck: later, claims, now: () => Date.now() + WINDOW_MS + 1000 }), 'itm_blk1');
});

test('a posted claim past the window posts again', async (t) => {
  const claims = scratchClaims(t);
  const deck = fakeDeck();
  assert.strictEqual(await postBlocked(step(), { deck, claims }), 'itm_blk1');
  assert.strictEqual(await postBlocked(step(), { deck, claims, now: () => Date.now() + 120000 }), null, 'within the window: held');
  assert.strictEqual(await postBlocked(step(), { deck, claims, now: () => Date.now() + WINDOW_MS + 1000 }), 'itm_blk2');
  assert.strictEqual(await postBlocked(step(), { deck, claims }), null, 'the new claim holds its own window');
});

test('a caller that already found the run live is not asked about it again', async (t) => {
  const deck = fakeDeck();
  deck.runs = () => assert.fail('runs() asked a second time');
  assert.strictEqual(await postBlocked(step(), { deck, claims: scratchClaims(t), live: true }), 'itm_blk1');
});

test('a long command is cut to 80 characters in the title and 600 in the body', async (t) => {
  const deck = fakeDeck();
  const command = 'x'.repeat(1000);
  assert.strictEqual(await postBlocked(step({ command }), { deck, claims: scratchClaims(t) }), 'itm_blk1');
  assert.strictEqual(deck.posts[0].title, 'Blocked: ' + 'x'.repeat(80));
  assert.ok(deck.posts[0].body.includes('Command: ' + 'x'.repeat(600) + '\n\n'), 'the body carries 600 of it');
  assert.ok(!deck.posts[0].body.includes('x'.repeat(601)), 'and no more');
});

test('the hook run as a process posts the denial and says nothing', async (t) => {
  const posts = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      let answer = { error: 'no such route' };
      if (url.pathname === '/api/runs') answer = { runs: [{ repo: REPO, pid: process.pid }] };
      else if (url.pathname === '/api/tickets') answer = { live: { id: 'itm_live' }, red: [], filed: { id: 'itm_live' } };
      else if (url.pathname === '/api/tool') {
        posts.push(JSON.parse(raw));
        answer = { content: [{ type: 'text', text: 'Posted itm_blocked to the deck.' }] };
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const tmp = scratchClaims(t); // the hook's own claims go under os.tmpdir(), so under this
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'permission-denied.js')], {
    env: { ...process.env, PILOT_DECK_PORT: String(server.address().port), CLAUDE_PROJECT_DIR: '', TEMP: tmp, TMP: tmp, TMPDIR: tmp },
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stdin.end(JSON.stringify(denial({ session_id: 'sess-process' })));
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout, '', 'a denial stays a denial');
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].arguments.title, 'Blocked: gh pr ready 576');
  assert.strictEqual(posts[0].arguments.ticket, 'itm_live');
});

test('a post the deck answered without an item id gives its claim back', async (t) => {
  const claims = scratchClaims(t);
  const odd = fakeDeck();
  odd.post = async () => ({ content: [{ type: 'text', text: 'something else' }] });
  assert.strictEqual(await postBlocked(step(), { deck: odd, claims }), null);
  assert.strictEqual(await postBlocked(step(), { deck: fakeDeck(), claims }), 'itm_blk1');
});

// blocked-yellow-yields S6, spec 7 (A2): the item is filed under the denied lane's ticket, which the deck names.

test('the hook posts on the filed ticket', async (t) => {
  const posts = [];
  const asked = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      let answer = { error: 'no such route' };
      if (url.pathname === '/api/runs') answer = { runs: [{ repo: REPO, pid: process.pid }] };
      else if (url.pathname === '/api/tickets') {
        const agent = url.searchParams.get('agent');
        asked.push(agent);
        // The live red ticket is `itm_red`; only the implementer's lane has a ticket on file.
        answer = { live: { id: 'itm_red' }, red: [], filed: agent === 'pilot:pilot-implementer' ? { id: 'Y' } : null };
      } else if (url.pathname === '/api/tool') {
        posts.push(JSON.parse(raw).arguments);
        answer = { content: [{ type: 'text', text: 'Posted itm_blocked to the deck.' }] };
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  pointDeckAt(t, server.address().port);

  await onDenied(denial({ agent_id: 'a1', agent_type: 'pilot:pilot-implementer' }), { claims: scratchClaims(t), env: {} });
  assert.deepStrictEqual(asked, ['pilot:pilot-implementer'], 'the deck is asked by agent type');
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].ticket, 'Y', 'the co-pilot\'s ticket, not the live red one');
  assert.strictEqual(posts[0].blocking, true);

  await onDenied(denial({ agent_id: 'a2', agent_type: 'pilot:pilot-qa' }), { claims: scratchClaims(t), env: {} });
  assert.strictEqual(posts.length, 2);
  assert.ok(!('ticket' in posts[1]), 'none filed: a plain question, never the live red ticket');
  assert.ok(!('blocking' in posts[1]));
});

// gate-no-stall S7, spec 6 (added): a denial's item says auto mode denied it.

test("a denial's item says auto mode denied it", async (t) => {
  const deck = fakeDeck();
  await onDenied(denial(), { deck, claims: scratchClaims(t), env: {} });
  assert.strictEqual(deck.posts.length, 1);
  assert.match(deck.posts[0].body, /^Auto mode denied this call, so it was not run/);
});

test('a refused edit is a question', async (t) => {
  for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
    const deck = fakeDeck();
    const out = await onDenied(
      denial({ tool_name: tool, tool_input: { file_path: path.join(REPO, 'agents', 'pilot.md') }, agent_id: 'a1', agent_type: 'pilot:pilot-implementer' }),
      { deck, claims: scratchClaims(t), env: {} },
    );
    assert.strictEqual(out, null, `${tool}: a denial stays a denial`);
    assert.deepStrictEqual(deck.posts, [], `${tool}: A5, the agent asks main instead`);
  }
  const deck = fakeDeck();
  await onDenied(denial({ agent_id: 'a1', agent_type: 'pilot:pilot-implementer' }), { deck, claims: scratchClaims(t), env: {} });
  assert.strictEqual(deck.posts.length, 1, 'a Bash denial still posts');
  assert.strictEqual(deck.posts[0].title, 'Blocked: gh pr ready 576');
});
