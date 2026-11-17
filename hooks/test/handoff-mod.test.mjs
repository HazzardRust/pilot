/**
 * handoff-mod S1 and S3: the mod, `hooks/handoff-mod.mjs`, is a thin adapter (L1). On the main session's
 * `turn.complete` it runs the look, clears, runs the look's `cleared`, and submits what that answered (L3); a
 * subagent's turn end does nothing (L4). S3: busy and idle from `turn.start` and `turn.complete`, `start` once at
 * `session.start`, the hold timers (idle only), and a submit that never started said aloud. The host is faked:
 * `on` collects the hooks, `$` records each call, and `$.clock` is a hand-wound clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from '../handoff-mod.mjs';

const LOOK = fileURLToPath(new URL('../../deck/run-look.mjs', import.meta.url));
const ID = 'itm_0123456789ab';
const PROMPT = 'Pick up the hand-off on the deck.';

/** The mod's hooks, as the host would hold them, from one `register`. */
function hooksOf() {
  const hooks = {};
  register((event, handler) => { hooks[event] = handler; });
  assert.equal(typeof hooks['turn.complete'], 'function', 'the mod hooks turn.complete');
  return hooks;
}

const hookOf = () => hooksOf()['turn.complete'];

/**
 * A host that records each call. The look answers `outcomes[op]` as its one stdout line; an array answers its
 * items in turn, the last one standing. `$.clock` runs only when the test calls `advance(ms)`.
 */
function host(outcomes) {
  const calls = [];
  const timers = new Set();
  let now = 0;
  const arm = (ms, fn, every) => {
    const timer = { at: now + ms, ms, fn, every };
    timers.add(timer);
    return { cancel: () => timers.delete(timer) };
  };
  const answer = (op) => {
    const outcome = outcomes[op];
    return Array.isArray(outcome) ? (outcome.length > 1 ? outcome.shift() : outcome[0]) : outcome;
  };
  const $ = {
    process: {
      run: async (argv, init) => {
        calls.push({ call: 'process.run', argv, init, at: now });
        const outcome = answer(argv[2]);
        return outcome === undefined ? { exitCode: 1, stdout: '', stderr: 'no' } : { exitCode: 0, stdout: `${JSON.stringify(outcome)}\n`, stderr: '' };
      },
    },
    command: { run: async (input) => { calls.push({ call: 'command.run', input, at: now }); return {}; } },
    prompt: { submit: async (input) => { calls.push({ call: 'prompt.submit', input, at: now }); return {}; } },
    clock: {
      now: async () => now,
      after: (ms, fn) => arm(ms, fn, false),
      every: (ms, fn) => arm(ms, fn, true),
    },
  };
  /** Wind the clock on by `ms`, firing each timer due on the way, in order, and awaiting what it started. */
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      const [due] = [...timers].filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at);
      if (!due) break;
      now = due.at;
      if (due.every) due.at += due.ms;
      else timers.delete(due);
      await due.fn();
    }
    now = end;
  }
  const looks = (op) => calls.filter(({ call, argv }) => call === 'process.run' && argv[2] === op);
  return { $, calls, timers, advance, looks };
}

const turnEnd = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' };
const turnStart = { text: '', turnId: 't2' };
const next = async () => 'the rest';

test('turn.complete runs the look, clears, then submits', async () => {
  const { $, calls } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const result = await hookOf()($, turnEnd, next);

  assert.equal(result, 'the rest', "the turn's own result stands");
  assert.deepEqual(calls.map(({ call }) => call), ['process.run', 'command.run', 'process.run', 'prompt.submit']);
  const [turn, clear, cleared, submit] = calls;
  assert.equal(turn.argv[0], 'node');
  assert.equal(path.resolve(turn.argv[1]), LOOK, "the look's path is the module's own");
  assert.deepEqual(turn.argv.slice(2), ['turn', '--turn-ended', '0']);
  assert.deepEqual(clear.input, { command: 'clear' });
  assert.equal(path.resolve(cleared.argv[1]), LOOK);
  assert.deepEqual(cleared.argv.slice(2), ['cleared', '--id', ID]);
  assert.deepEqual(submit.input, { text: PROMPT });
});

test("a subagent's turn.complete does nothing", async () => {
  const { $, calls } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const result = await hookOf()($, { ...turnEnd, agentId: 'a1' }, next);

  assert.equal(result, 'the rest');
  assert.deepEqual(calls, []);
});

test('a look that fails, a malformed id or a prompt that is not the literal clears or submits nothing', async () => {
  const cases = [
    [{}, ['process.run']], // the look exited non-zero
    [{ turn: { act: 'none', why: 'this session posted no hand-off' } }, ['process.run']],
    [{ turn: { act: 'clear', id: 'itm_../x' } }, ['process.run']],
    [{ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: '/exit' } }, ['process.run', 'command.run', 'process.run']],
    [{ turn: { act: 'clear', id: ID }, cleared: { act: 'said', id: ID, why: 'no marker' } }, ['process.run', 'command.run', 'process.run']],
  ];
  for (const [outcomes, expected] of cases) {
    const { $, calls } = host(outcomes);
    await hookOf()($, turnEnd, async () => undefined);
    assert.deepEqual(calls.map(({ call }) => call), expected, JSON.stringify(outcomes));
  }
});

test("a refused clear (the Stop hold) submits nothing and the turn's result stands", async () => {
  const { $, calls } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  $.command.run = async () => { calls.push({ call: 'command.run' }); throw new Error('refused until the user types'); };

  assert.equal(await hookOf()($, turnEnd, next), 'the rest');
  assert.deepEqual(calls.map(({ call }) => call), ['process.run', 'command.run']);
});

test('a held outcome looks again at its bound and every 30 s, idle only', async () => {
  const until = 100_000;
  const { $, advance, looks } = host({ turn: { act: 'held', id: ID, until } });
  const hooks = hooksOf();

  await hooks['turn.complete']($, turnEnd, next); // look at 0: held
  await advance(40_000); // tick at 30 s
  await hooks['turn.start']($, turnStart, next); // busy from 40 s
  await advance(30_000); // the tick at 60 s finds the session busy
  await hooks['turn.complete']($, turnEnd, next); // idle at 70 s: the turn end looks
  await advance(30_000); // tick at 90 s, the bound at 100 s

  assert.deepEqual(looks('turn').map(({ at }) => at), [0, 30_000, 70_000, 90_000, 100_000]);
});

test('a clear answered to a timer look a turn overtook waits for that turn to end', async () => {
  const { $, calls, advance } = host({ turn: [{ act: 'held', id: ID, until: 1_200_000 }, { act: 'clear', id: ID }], cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const hooks = hooksOf();
  await hooks['turn.complete']($, turnEnd, next);
  const run = $.process.run;
  $.process.run = async (argv) => {
    const answer = await run(argv);
    if (argv[2] === 'turn') await hooks['turn.start']($, turnStart, next); // the user typed while the look ran
    return answer;
  };

  await advance(30_000);
  assert.equal(calls.filter(({ call }) => call === 'command.run').length, 0, 'no clear mid-turn');
  $.process.run = run;
  await hooks['turn.complete']($, turnEnd, next);

  assert.deepEqual(calls.map(({ call, argv }) => argv?.[2] ?? call), ['turn', 'turn', 'command.run', 'cleared', 'prompt.submit']);
});

test('a release ends the timers', async () => {
  for (const release of [{ act: 'clear', id: ID }, { act: 'none', why: 'the hand-off is closed' }]) {
    const { $, advance, timers, looks } = host({
      turn: [{ act: 'held', id: ID, until: 1_200_000 }, release],
      cleared: { act: 'submit', id: ID, prompt: PROMPT },
    });
    const hooks = hooksOf();

    await hooks['turn.complete']($, turnEnd, next);
    assert.equal(timers.size, 2, 'held: the bound and the 30 s tick');
    await advance(30_000); // the tick's look answers the release
    if (release.act === 'clear') await hooks['turn.start']($, turnStart, next); // the submitted turn starts

    assert.equal(timers.size, 0, JSON.stringify(release));
    await advance(120_000);
    assert.equal(looks('turn').length, 2, 'no look after the release');
  }
});

test('session.start runs start once', async () => {
  const { $, looks } = host({ start: { act: 'none', why: 'reported in' }, turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT } });
  const hooks = hooksOf();

  assert.equal(typeof hooks['session.start'], 'function', 'the mod hooks session.start');
  assert.equal(await hooks['session.start']($, { cwd: '/repo', surface: 'terminal', isInteractive: true }, next), 'the rest');
  await hooks['turn.complete']($, turnEnd, next); // clears and submits; the host does not refire session.start
  await hooks['turn.start']($, turnStart, next);
  await hooks['turn.complete']($, turnEnd, next);

  assert.deepEqual(looks('start').map(({ argv }) => argv.slice(2)), [['start']]);
});

test('a refused submit is said', async () => {
  const { $, calls, advance, looks } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT }, unstarted: { act: 'said', id: ID, why: 'refused' } });
  $.prompt.submit = async () => { calls.push({ call: 'prompt.submit' }); throw new Error('refused until the user types'); };

  assert.equal(await hookOf()($, turnEnd, next), 'the rest');
  await advance(120_000);

  assert.deepEqual(looks('unstarted').map(({ argv }) => argv.slice(2)), [['unstarted', '--id', ID, '--why', 'refused']]);
});

test('no turn.start within 60 s is said; one inside it is not', async () => {
  for (const startedAt of [null, 30_000]) {
    const { $, advance, looks } = host({ turn: { act: 'clear', id: ID }, cleared: { act: 'submit', id: ID, prompt: PROMPT }, unstarted: { act: 'said', id: ID, why: 'no turn' } });
    const hooks = hooksOf();

    await hooks['turn.complete']($, turnEnd, next);
    if (startedAt !== null) {
      await advance(startedAt);
      await hooks['turn.start']($, turnStart, next);
    }
    await advance(120_000);

    const expected = startedAt === null ? [['unstarted', '--id', ID, '--why', 'no turn']] : [];
    assert.deepEqual(looks('unstarted').map(({ argv }) => argv.slice(2)), expected, `turn.start at ${startedAt}`);
  }
});

test('the turn-ended time passed to the look is the last turn.complete', async () => {
  const { $, advance, looks } = host({ turn: { act: 'held', id: ID, until: 1_200_000 } });
  const hooks = hooksOf();

  await advance(5_000);
  await hooks['turn.start']($, turnStart, next);
  await advance(2_000);
  await hooks['turn.complete']($, turnEnd, next); // ends at 7 s
  await advance(30_000); // the tick at 37 s

  assert.deepEqual(looks('turn').map(({ argv, at }) => [at, argv.slice(3)]), [
    [7_000, ['--turn-ended', '7000']],
    [37_000, ['--turn-ended', '7000']],
  ]);
});
