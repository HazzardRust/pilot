/**
 * handoff-mod S1: the mod, `hooks/handoff-mod.mjs`, is a thin adapter (L1). On the main session's
 * `turn.complete` it runs the look, clears, runs the look's `cleared`, and submits what that answered (L3); a
 * subagent's turn end does nothing (L4). The host is faked: `on` collects the hooks and `$` records each call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from '../handoff-mod.mjs';

const LOOK = fileURLToPath(new URL('../../deck/run-look.mjs', import.meta.url));
const ID = 'itm_0123456789ab';
const PROMPT = 'Pick up the hand-off on the deck.';

/** The mod's `turn.complete` hook, as the host would hold it. */
function hookOf() {
  const hooks = {};
  register((event, handler) => { hooks[event] = handler; });
  assert.equal(typeof hooks['turn.complete'], 'function', 'the mod hooks turn.complete');
  return hooks['turn.complete'];
}

/** A host that records each call; the look answers `outcomes[op]` as its one stdout line. */
function host(outcomes) {
  const calls = [];
  const $ = {
    process: {
      run: async (argv, init) => {
        calls.push({ call: 'process.run', argv, init });
        const outcome = outcomes[argv[2]];
        return outcome === undefined ? { exitCode: 1, stdout: '', stderr: 'no' } : { exitCode: 0, stdout: `${JSON.stringify(outcome)}\n`, stderr: '' };
      },
    },
    command: { run: async (input) => { calls.push({ call: 'command.run', input }); return {}; } },
    prompt: { submit: async (input) => { calls.push({ call: 'prompt.submit', input }); return {}; } },
  };
  return { $, calls };
}

const turnEnd = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'completed' };

test('turn.complete runs the look, clears, then submits', async () => {
  const { $, calls } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const result = await hookOf()($, turnEnd, async () => 'the rest');

  assert.equal(result, 'the rest', "the turn's own result stands");
  assert.deepEqual(calls.map(({ call }) => call), ['process.run', 'command.run', 'process.run', 'prompt.submit']);
  const [turn, clear, cleared, submit] = calls;
  assert.equal(turn.argv[0], 'node');
  assert.equal(path.resolve(turn.argv[1]), LOOK, "the look's path is the module's own");
  assert.deepEqual(turn.argv.slice(2), ['turn']);
  assert.deepEqual(clear.input, { command: 'clear' });
  assert.equal(path.resolve(cleared.argv[1]), LOOK);
  assert.deepEqual(cleared.argv.slice(2), ['cleared', '--id', ID]);
  assert.deepEqual(submit.input, { text: PROMPT });
});

test("a subagent's turn.complete does nothing", async () => {
  const { $, calls } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const result = await hookOf()($, { ...turnEnd, agentId: 'a1' }, async () => 'the rest');

  assert.equal(result, 'the rest');
  assert.deepEqual(calls, []);
});

test('a look that fails, a malformed id or a prompt that is not the literal clears or submits nothing', async () => {
  const cases = [
    [{}, ['process.run']], // the look exited non-zero
    [{ turn: { act: 'none', why: 'this session posted no hand-off' } }, ['process.run']],
    [{ turn: { act: 'clear', id: 'itm_../x' } }, ['process.run']],
    [{ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: '/exit' } }, ['process.run', 'command.run', 'process.run']],
    [{ turn: { act: 'clear', id: ID }, cleared: { act: 'none', why: 'no lane marker' } }, ['process.run', 'command.run', 'process.run']],
  ];
  for (const [outcomes, expected] of cases) {
    const { $, calls } = host(outcomes);
    await hookOf()($, turnEnd, async () => undefined);
    assert.deepEqual(calls.map(({ call }) => call), expected, JSON.stringify(outcomes));
  }
});
