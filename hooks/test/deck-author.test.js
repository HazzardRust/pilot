#!/usr/bin/env node
/**
 * S1 of run-record: the hook that says who wrote a deck message (spec 2; L1,
 * L2, L16, ADR 0027).
 *
 * The claim is that the author is the harness's and never the agent's: every
 * `deck_post`, `deck_reply` and `deck_resolve` leaves this hook carrying the
 * raw `agent_type` as `author`, `""` when there is none, and whatever the
 * agent wrote into `author` itself is gone. The mapping from that raw type to
 * a kind is the daemon's (`deck/test/author.test.mjs`); this file only proves
 * the stamp, and that the manifest puts the hook on exactly those three tools.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { stampAuthor } = require('../deck-author.js');

const HOOK = path.join(__dirname, '..', 'deck-author.js');

const aReply = { id: 'itm_1', text: 'from QA: it works' };

test('a subagent call carries its agent_type as the author', () => {
  const out = stampAuthor({
    tool_name: 'mcp__plugin_pilot_deck__deck_reply',
    tool_input: aReply,
    agent_type: 'pilot:pilot-qa',
    agent_id: 'a1',
  });
  assert.deepStrictEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...aReply, author: 'pilot:pilot-qa' },
    },
  });
});

test('a main-session call with no agent_type is stamped with an empty author', () => {
  const out = stampAuthor({ tool_name: 'mcp__plugin_pilot_deck__deck_post', tool_input: { kind: 'question', title: 't', body: 'b' } });
  assert.strictEqual(out.hookSpecificOutput.updatedInput.author, '');
});

test('an author the agent wrote itself is overwritten, never kept (spec 2)', () => {
  const claimed = stampAuthor({ tool_input: { ...aReply, author: 'qa' } });
  assert.strictEqual(claimed.hookSpecificOutput.updatedInput.author, '', 'the pilot claiming to be qa');

  const sub = stampAuthor({ tool_input: { ...aReply, author: 'pilot' }, agent_type: 'pilot:pilot-teacher' });
  assert.strictEqual(sub.hookSpecificOutput.updatedInput.author, 'pilot:pilot-teacher');
});

test('the hook asks no permission question of its own', () => {
  const out = stampAuthor({ tool_input: aReply, agent_type: 'pilot:pilot-qa' });
  assert.strictEqual('permissionDecision' in out.hookSpecificOutput, false);
});

test('run as a hook, it answers the harness on stdout', () => {
  const run = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { ...aReply, author: 'qa' }, agent_type: 'Explore' }),
    encoding: 'utf8',
  });
  assert.strictEqual(run.status, 0);
  assert.deepStrictEqual(JSON.parse(run.stdout).hookSpecificOutput.updatedInput, { ...aReply, author: 'Explore' });
});

test('a payload it cannot read leaves the call alone rather than failing it', () => {
  const run = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(run.status, 0);
  assert.strictEqual(run.stdout, '');
});

test('deck-author stamps deck_wait and deck_read', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks.json'), 'utf8'));
  const entry = manifest.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('deck-author.js')));
  assert.ok(entry, 'deck-author.js is registered on PreToolUse');

  // A wait is heard by the owner kind the hook stamps (thread-ownership S1, ADR 0041),
  // so the three tools that write a message and the two that are handed replies.
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  for (const tool of ['deck_post', 'deck_reply', 'deck_resolve', 'deck_read', 'deck_wait', 'deck_status']) {
    assert.ok(matcher.test(`mcp__plugin_pilot_deck__${tool}`), tool);
  }
  const waiting = stampAuthor({ tool_name: 'mcp__plugin_pilot_deck__deck_wait', tool_input: { timeout: 60000, author: 'qa' } });
  assert.strictEqual(waiting.hookSpecificOutput.updatedInput.author, '', 'the pilot cannot wait as qa by saying so');
});
