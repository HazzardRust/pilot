#!/usr/bin/env node
/**
 * A1 of yellow-agent: a crew agent's permission prompt is refused by a hook
 * (spec 3, L17 as amended: "A hook refuses it").
 *
 * The F1 probe (PR #348) showed an `ask` rule prompting in the main terminal for
 * a co-pilot's implementer under an auto-mode main session, and the lane waiting
 * on it. The claim here is the hook's whole contract, read the way the harness
 * reads it: the hook run as a child process, the event's JSON on stdin. A call
 * from this plugin's own agents is denied with the blocked-step instruction; the
 * main session's prompt, another plugin's agent's and an unreadable payload are
 * left to the user, with no output; and nothing ever makes it answer `allow`.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { decide } = require('../permission-refuse.js');

const HOOK = path.join(__dirname, '..', 'permission-refuse.js');
const REPO = path.join(os.tmpdir(), 'pilot-refuse-repo');

/** A port nothing listens on: bound by the OS, then closed. The spawned hook asks it, never 4321. */
let deadPort;
test.before(async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  deadPort = server.address().port;
  await new Promise((resolve) => server.close(resolve));
});

/** The event as Claude Code sends it for a Bash call an `ask` rule matches. */
function event(extra) {
  return {
    session_id: 's1',
    cwd: '/repo',
    permission_mode: 'auto',
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main' },
    tool_use_id: 'toolu_1',
    ...extra,
  };
}

function runHook(input) {
  const run = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_PORT: String(deadPort), CLAUDE_PROJECT_DIR: '' },
  });
  return run;
}

test("a crew agent's permission prompt is denied with the blocked-step instruction", () => {
  const run = runHook(event({ agent_id: 'a1b2', agent_type: 'pilot:pilot-implementer' }));
  assert.strictEqual(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PermissionRequest');
  const decision = out.hookSpecificOutput.decision;
  assert.strictEqual(decision.behavior, 'deny');
  assert.strictEqual(decision.interrupt, false, 'the agent carries on with the denial as context');
  const message = decision.message;
  assert.match(message, /crew agent never waits on a permission prompt/);
  assert.match(message, /blocked step/);
  assert.match(message, /command/);
  assert.match(message, /do not retry/i);
  assert.match(message, /route around/);
  assert.match(message, /carry on with the work that does not need it/);
});

test("the main session's prompt is left to the user", () => {
  // `agent_type` alone is the main session started with `--agent pilot:pilot`: still the user's.
  for (const input of [event({}), event({ agent_type: 'pilot:pilot' }), event({ agent_id: '', agent_type: 'pilot:pilot' })]) {
    const run = runHook(input);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(run.stdout, '');
  }
});

test('an agent that is not this plugin\'s is left alone', () => {
  for (const agentType of ['Explore', 'general-purpose', 'other:pilot-implementer', 'xpilot:qa', '', undefined, 7]) {
    const run = runHook(event({ agent_id: 'a1b2', agent_type: agentType }));
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(run.stdout, '', String(agentType));
  }
});

test('unreadable input leaves the prompt to the user', () => {
  for (const input of ['not json', '', 'null', '[]', '"pilot:"']) {
    const run = runHook(input);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(run.stdout, '', JSON.stringify(input));
  }
});

test('the hook never answers allow', () => {
  const inputs = [
    event({ agent_id: 'a1', agent_type: 'pilot:pilot-co-pilot' }),
    event({ agent_id: 'a1', agent_type: 'pilot:pilot-qa', permission_mode: 'bypassPermissions' }),
    event({ agent_id: 'a1', agent_type: 'pilot:pilot-implementer', decision: { behavior: 'allow' } }),
    event({ agent_type: 'pilot:pilot' }),
    event({}),
    'not json',
  ];
  for (const input of inputs) {
    const run = runHook(input);
    assert.doesNotMatch(run.stdout, /allow/i, JSON.stringify(input));
  }
  assert.doesNotMatch(fs.readFileSync(HOOK, 'utf8'), /['"]allow['"]/, 'no allow literal in the hook');
});

test('hooks.json registers the hook under PermissionRequest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks.json'), 'utf8'));
  const entries = manifest.hooks.PermissionRequest || [];
  const entry = entries.find((e) => e.hooks.some((h) => h.command.includes('permission-refuse.js')));
  assert.ok(entry, 'permission-refuse.js is registered on PermissionRequest');
  assert.strictEqual(entry.matcher, undefined, 'every tool: a prompt for any tool would stall the lane');
  assert.strictEqual(entry.hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/permission-refuse.js"');
  assert.strictEqual(typeof entry.id, 'string');
  assert.strictEqual(typeof entry.description, 'string');
});

// gate-no-stall S2, spec 4 (L5, L10): in a live run the pilot session's prompt is refused and posted.

/** A deck injected as an object: one live run in REPO unless told otherwise. */
function fakeDeck({ live = true } = {}) {
  return { runs: async () => ({ runs: live ? [{ repo: REPO, pid: 1 }] : [] }) };
}

/** `postBlocked`, recorded: every step it is handed, and an item id back. */
function fakePost() {
  const steps = [];
  const post = async (step) => {
    steps.push(step);
    return 'itm_blk' + steps.length;
  };
  return { steps, post };
}

function pilotEvent(extra) {
  return event({ cwd: REPO, agent_type: 'pilot:pilot', tool_input: { command: 'npm publish' }, ...extra });
}

test("the pilot session's prompt in a live run is denied and posted", async () => {
  for (const agentType of ['pilot:pilot', 'pilot']) {
    const { steps, post } = fakePost();
    const out = await decide(pilotEvent({ agent_type: agentType }), { deck: fakeDeck(), post, env: {} });
    assert.ok(out, agentType);
    assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PermissionRequest');
    const decision = out.hookSpecificOutput.decision;
    assert.strictEqual(decision.behavior, 'deny');
    assert.strictEqual(decision.interrupt, false);
    assert.match(decision.message, /run is live/);
    assert.match(decision.message, /blocked (step|item)/);
    assert.match(decision.message, /do not retry/i);
    assert.match(decision.message, /route around/);
    assert.match(decision.message, /carry on with the work that does not need it/);
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].command, 'npm publish');
    assert.strictEqual(steps[0].repo, REPO);
    assert.strictEqual(steps[0].agent, agentType);
    assert.strictEqual(steps[0].session, 's1');
  }
});

test("with no live run the pilot's prompt is the user's", async () => {
  const { steps, post } = fakePost();
  assert.strictEqual(await decide(pilotEvent({}), { deck: fakeDeck({ live: false }), post, env: {} }), null);
  assert.strictEqual(steps.length, 0);
});

test('a deck that does not answer leaves the prompt to the user', async (t) => {
  const held = [];
  const server = http.createServer((request) => { held.push(request); }); // takes the request, never answers
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const request of held) request.socket.destroy();
    return new Promise((resolve) => server.close(resolve));
  });
  const before = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(server.address().port);
  t.after(() => {
    if (before === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = before;
  });
  const { steps, post } = fakePost();
  const started = Date.now();
  assert.strictEqual(await decide(pilotEvent({}), { post, env: {} }), null);
  assert.ok(Date.now() - started < 5000, "inside the hook's 5 s timeout");
  assert.strictEqual(steps.length, 0);
});

test("a crew agent's prompt is denied as before, and posted", async () => {
  const { steps, post } = fakePost();
  const payload = event({ cwd: REPO, agent_id: 'a1b2', agent_type: 'pilot:pilot-implementer' });
  const out = await decide(payload, { deck: fakeDeck(), post, env: {} });
  assert.deepStrictEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'deny',
        message:
          'Refused: a crew agent never waits on a permission prompt, so this call was not run. ' +
          'Record it as a blocked step with its exact command, do not retry it and do not route around it, ' +
          'and carry on with the work that does not need it.',
        interrupt: false,
      },
    },
  });
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].command, 'git push origin main');
  assert.strictEqual(steps[0].agent, 'pilot:pilot-implementer');
});

test("a plain session and another plugin's agent are untouched", async () => {
  const payloads = [
    event({ cwd: REPO }),
    event({ cwd: REPO, agent_type: 'Explore' }),
    event({ cwd: REPO, agent_type: 'other:pilot' }),
    event({ cwd: REPO, agent_id: 'a1b2', agent_type: 'other:pilot-implementer' }),
    event({ cwd: REPO, agent_id: 'a1b2', agent_type: 'pilot' }),
    null,
  ];
  for (const payload of payloads) {
    const { steps, post } = fakePost();
    assert.strictEqual(await decide(payload, { deck: fakeDeck(), post, env: {} }), null, JSON.stringify(payload));
    assert.strictEqual(steps.length, 0, JSON.stringify(payload));
  }
});

test('a post that does not finish does not hold the refusal past the hook timeout', { timeout: 4500 }, async () => {
  const never = () => new Promise(() => {});
  const started = Date.now();
  for (const payload of [pilotEvent({}), event({ cwd: REPO, agent_id: 'a1b2', agent_type: 'pilot:pilot-qa' })]) {
    const out = await decide(payload, { deck: fakeDeck(), post: never, env: {} });
    assert.strictEqual(out.hookSpecificOutput.decision.behavior, 'deny');
  }
  assert.ok(Date.now() - started < 4500, 'both refusals inside the budget');
});

// gate-no-stall S7, spec 6 (added): a refused prompt's item says the hook refused it, not auto mode.

test("a refused prompt's item does not say auto mode denied it", async (t) => {
  const claims = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-refuse-claims-'));
  t.after(() => fs.rmSync(claims, { recursive: true, force: true }));
  const posts = [];
  let asked = 0;
  const deck = {
    runs: async () => {
      asked += 1;
      return { runs: [{ repo: REPO, pid: 1 }] };
    },
    post: async (item) => {
      posts.push(item);
      return { content: [{ type: 'text', text: 'Posted itm_blk to the deck.' }] };
    },
  };
  for (const payload of [pilotEvent({}), event({ agent_id: 'a1', agent_type: 'pilot:pilot-implementer', cwd: REPO })]) {
    posts.length = 0;
    asked = 0;
    assert.ok(await decide(payload, { deck, claims, env: {} }), payload.agent_type);
    assert.strictEqual(posts.length, 1, payload.agent_type);
    assert.strictEqual(asked, 1, `${payload.agent_type}: the deck is asked once whether the run is live`);
    assert.doesNotMatch(posts[0].body, /auto mode/i, payload.agent_type);
    assert.match(posts[0].body, /^Its permission prompt was refused by the pilot's hook, so this call was not run/, payload.agent_type);
  }
});
