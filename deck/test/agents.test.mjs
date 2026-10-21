/**
 * Slice S5 of deck-workspace: who is live, on the third tab (spec 9; L7, L8,
 * L9, A1, A2, ADR 0024).
 *
 * The roster is the one thing in the deck that is *observed* rather than
 * declared: nothing announces an agent and nothing can deregister one, because
 * an agent that is killed never gets the chance. So every claim here is about
 * time. An agent is on the roster because its hook said so inside the window,
 * and off it because nothing has said so for 90 s — which is why the staleness
 * test drives the clock by hand rather than sleeping through it.
 *
 * Two shapes of test, for two kinds of claim. The membership rules are asked of
 * `deck/agents.mjs` directly, because "the same agent twice is one agent" is a
 * claim about a map. What the *page* is told runs over a real deck with a real
 * browser parked on `/events`, because "announced only when membership changes"
 * (L9) is a claim about frames on a socket, and counting them is the only way
 * to prove the heartbeat between two of them pushed nothing.
 *
 * Every test takes its own store directory, its own port and its own roster.
 * Nothing here may touch the real store or port 4321: this machine runs a real
 * deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { LIVE_WINDOW_MS, MAX_AGENTS, forgetAgents, listAgents, noteAgent, sweepAgents, watchAgents } =
  await import('../agents.mjs');
const { browserCount } = await import('../server.mjs');
const { listDeckNumbers, listItems, listRuns, registerRun, storeFile } = await import(
  '../store.mjs'
);
const { repoKey } = await import('../runs.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

// --- harness ---------------------------------------------------------------

/** Two directories, spelled the way the platform running the test spells them. */
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

/** The roster outlives one test: it is the daemon's memory, not the store's. */
const ownRoster = (t) => t.after(forgetAgents);

/** What a hook sends after a subagent's tool call (`hooks/agent-roster.js`). */
const anAgent = (over = {}) => ({
  cwd: MINE,
  agentId: 'a1f78b7c83',
  agentType: 'pilot-implementer',
  ...over,
});

const heartbeat = async (base, body) => {
  const answer = await fetch(`${base}/api/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: answer.status, body: await answer.json() };
};

async function until(predicate, what) {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) await sleep(5);
  assert.ok(predicate(), what);
}

/**
 * A page reading `/events`, and every frame the daemon has pushed to it so far.
 * The array is the subject: L9 is a claim about how many of these there are, so
 * a helper that handed back one frame at a time would hide the frames that must
 * not exist.
 */
async function aBrowserOn(base, t) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${base}/events`, { signal: controller.signal });
  const reader = response.body.getReader();
  const frames = [];
  (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      frames.push(new TextDecoder().decode(value));
    }
  })().catch(() => {
    /* the test ended and the stream was aborted underneath it */
  });
  await until(() => browserCount() === 1, 'the page is counted as watching the deck');
  return frames;
}

/** Long enough for a frame that was going to arrive to have arrived. */
const quiet = () => sleep(50);

/** What is inside one bookmark's panel, which is what the user reads in it. */
const panelOf = (page, which) =>
  new RegExp(`<div class="panel" data-live="${which}"[^>]*>([\\s\\S]*?)</div>\\s*</details>`).exec(
    page,
  )?.[1] ?? null;

/** The home page as the daemon serves it, with the roster it holds at this moment. */
const homePage = (selected) =>
  renderHomePage(listItems(), listRuns(), selected, false, listDeckNumbers(), listAgents());

// --- the roster itself -----------------------------------------------------

test("a heartbeat puts an agent on its deck's roster, and tells the page once", async (t) => {
  const base = await deckOnAPort(t);
  ownRoster(t);
  const frames = await aBrowserOn(base, t);

  const answer = await heartbeat(base, anAgent());

  assert.equal(answer.status, 200);
  assert.deepEqual(
    listAgents()[repoKey(MINE)]?.map((agent) => agent.agentType),
    ['pilot-implementer'],
    'the deck holds the agent against the directory it is working in',
  );
  await until(() => frames.length === 1, 'the page is told an agent arrived');
});

test('a second heartbeat from the same agent moves nothing and tells the page nothing', async (t) => {
  const base = await deckOnAPort(t);
  ownRoster(t);
  const frames = await aBrowserOn(base, t);

  await heartbeat(base, anAgent());
  await until(() => frames.length === 1, 'the page is told an agent arrived');
  const [first] = listAgents()[repoKey(MINE)];

  await heartbeat(base, anAgent());
  await quiet();

  assert.equal(frames.length, 1, 'a heartbeat is not a change, and the page is left alone (L9)');
  assert.equal(
    listAgents()[repoKey(MINE)][0].since,
    first.since,
    'how long it has been live is measured from when it arrived, not from its last call',
  );
});

test('an agent that has not called a tool for 90 s leaves the roster, and the page is told once', async (t) => {
  const base = await deckOnAPort(t);
  ownRoster(t);
  const frames = await aBrowserOn(base, t);

  await heartbeat(base, anAgent());
  await until(() => frames.length === 1, 'the page is told an agent arrived');
  // The clock is driven by hand rather than slept through: the window is 90 s,
  // and taken from the heartbeat the deck has just recorded rather than from
  // before it, so this is the moment after that agent's own window closes.
  const gone = Date.now() + LIVE_WINDOW_MS + 1;

  assert.deepEqual(
    listAgents(gone),
    {},
    'an agent past the window is not live, whether or not the sweep has come round yet',
  );
  assert.equal(sweepAgents(gone), true, 'the sweep takes it off');
  await until(() => frames.length === 2, 'the page is told it left, with no reload');

  assert.equal(sweepAgents(gone + 1), false, 'and there is nothing left to say');
  await quiet();
  assert.equal(frames.length, 2, 'a sweep that removes nothing tells the page nothing');
});

test('the scheduled timer sweeps a departure on its own, unprompted by any later heartbeat', async (t) => {
  tempDeck(t);
  ownRoster(t);
  const told = [];
  watchAgents(() => told.push(listAgents()[repoKey(MINE)]?.map((agent) => agent.agentType) ?? []));
  t.after(() => watchAgents(() => {}));

  // `a` arrives ~30 ms short of stale; `b`'s own arrival reschedules the timer
  // around `a`'s window, due in the ~31 ms this test waits out.
  noteAgent(anAgent(), Date.now() - LIVE_WINDOW_MS + 30);
  noteAgent(anAgent({ agentId: 'b2', agentType: 'pilot-qa' }));

  await until(() => told.length === 3, 'the scheduled timer swept the stale agent on its own');
  assert.deepEqual(told.at(-1), ['pilot-qa'], 'a is gone; b, freshly arrived, is still listed');
});

test('that timer is due the millisecond after the window closes, and runs once', (t) => {
  tempDeck(t);
  ownRoster(t);
  // The clock is the whole subject here, so it is this test's own: the moment
  // the sweep is due is `oldest + LIVE_WINDOW_MS - now` away, and a test that
  // slept through it could only ever say "about then".
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let told = 0;
  watchAgents(() => { told += 1; });
  t.after(() => watchAgents(() => {}));

  noteAgent(anAgent(), Date.now());
  assert.equal(told, 1, 'the arrival');

  t.mock.timers.tick(LIVE_WINDOW_MS);

  // The window is `<`, so this agent stopped being live on the millisecond just
  // ticked to — and the sweep is due the one *after* it. The page being told
  // anything here would mean the deck swept somebody it still counted as live.
  assert.equal(told, 1, 'at the closing millisecond itself the timer has not run');

  t.mock.timers.tick(1);

  assert.equal(told, 2, 'the millisecond after, it has, and the page is told');
  assert.deepEqual(listAgents(), {}, 'and the roster it swept is empty');

  t.mock.timers.tick(LIVE_WINDOW_MS * 2);
  assert.equal(told, 2, 'with nobody left there is nothing to schedule and nothing more to say');
});

test('two decks keep their own rosters, and a tab shows only its own', (t) => {
  tempDeck(t);
  ownRoster(t);
  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: THEIRS, pid: process.pid });

  noteAgent(anAgent());
  noteAgent(anAgent({ cwd: THEIRS, agentId: 'bQA22', agentType: 'pilot-qa' }));

  assert.deepEqual(
    Object.keys(listAgents()).sort(),
    [repoKey(MINE), repoKey(THEIRS)].sort(),
    'the roster is keyed on the working directory, which is what a deck is',
  );
  const mine = panelOf(homePage(MINE), 'agents');
  assert.match(mine, /pilot-implementer/, "this deck's agent is on this deck's tab");
  assert.doesNotMatch(mine, /pilot-qa/, "and the other deck's is not");
});

test('the panel says what an agent is and how long it has been live, and nothing else (A2)', (t) => {
  tempDeck(t);
  ownRoster(t);
  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: THEIRS, pid: process.pid });

  noteAgent(anAgent());
  const panel = panelOf(homePage(MINE), 'agents');

  assert.match(panel, /pilot-implementer/, 'what it is');
  assert.match(panel, /<time datetime="[^"]+">/, 'and since when, for `time.mjs` to read as a span');
  assert.doesNotMatch(panel, /a1f78b7c83/, 'never the id, which is bookkeeping and not news');
  // Reversed by the user at Gate 2, 2026-09-23, where this read: "a deck with
  // nobody live draws an empty panel rather than a heading over nothing". It
  // still draws no heading — that is spec 33's label now, and it is the
  // stylesheet's — but the panel says in words that it has nobody, because
  // every panel has a floor under it and an empty one was a box of that height
  // with nothing whatever in it.
  assert.match(
    panelOf(homePage(THEIRS), 'agents'),
    /^<p class="nobody">no agents live<\/p>$/,
    'a deck with nobody live says so in one quiet line, and draws no roster',
  );
});

test('two agents in one deck are drawn oldest first', (t) => {
  tempDeck(t);
  ownRoster(t);
  registerRun({ repo: MINE, pid: process.pid });
  // Inserted newest first, so the order on the page is the sort's doing and not
  // the map's: drawn in insertion order this reads `pilot-qa` first and fails.
  noteAgent(anAgent({ agentId: 'b2', agentType: 'pilot-qa' }));
  noteAgent(anAgent(), Date.now() - 1000);
  const panel = panelOf(homePage(MINE), 'agents');
  assert.ok(panel.indexOf('pilot-implementer') < panel.indexOf('pilot-qa'), 'first arrival first');
});

test('an agent exactly at the window boundary reads as gone', (t) => {
  tempDeck(t);
  ownRoster(t);
  const since = Date.now();
  noteAgent(anAgent(), since);
  assert.deepEqual(listAgents(since + LIVE_WINDOW_MS), {}, 'the boundary itself is not live');
  assert.ok(repoKey(MINE) in listAgents(since + LIVE_WINDOW_MS - 1), 'one ms earlier still is');
});

// --- what the deck refuses -------------------------------------------------

test('a heartbeat the deck cannot read is refused, and nothing joins the roster', async (t) => {
  const base = await deckOnAPort(t);
  ownRoster(t);

  const refusals = [
    anAgent({ agentId: '' }),
    anAgent({ cwd: '   ' }),
    anAgent({ agentId: { not: 'a string' } }),
    anAgent({ cwd: 42 }), // a cwd that is not a string is a refusal, not a 500
    anAgent({ agentId: 'x'.repeat(65) }), // one character past MAX_ID_CHARS
    anAgent({ agentId: '<script>a1' }), // a plain *ending* is not a plain name
    anAgent({ agentId: 'a1<script>' }), // nor is a plain beginning
    anAgent({ cwd: 'c'.repeat(4097) }), // one character past MAX_CWD_CHARS
  ];
  for (const payload of refusals) {
    const answer = await heartbeat(base, payload);
    assert.equal(answer.status, 400, `the deck refuses ${JSON.stringify(payload).slice(0, 60)}`);
  }

  assert.deepEqual(listAgents(), {}, 'and none of them is on the roster');

  // The limit itself is a name: the length test is `>` and the refusal above is
  // the character after this one.
  const idAtLimit = 'x'.repeat(64);
  const longest = await heartbeat(base, anAgent({ agentId: idAtLimit }));
  assert.equal(longest.status, 200, 'an id exactly at the limit still joins');
  forgetAgents();

  // A malformed type is refused itself, not the whole agent: `agentId` and
  // `cwd` still cost a stranger its row, but a bad type only costs its name.
  const scripted = await heartbeat(base, anAgent({ agentType: 'pilot-qa<script>' }));
  assert.equal(scripted.status, 200, 'the agentId and cwd were fine');
  assert.equal(listAgents()[repoKey(MINE)][0].agentType, 'an agent', 'drawn as the fallback');

  const atLimit = 'x'.repeat(60);
  await heartbeat(base, anAgent({ agentId: 'b2', agentType: atLimit }));
  assert.equal(
    listAgents()[repoKey(MINE)].find((a) => a.agentType !== 'an agent')?.agentType,
    atLimit,
    'a type at the length limit is a plain name, drawn as itself',
  );
});

test('the roster will not grow without bound, however many strangers report', (t) => {
  tempDeck(t);
  ownRoster(t);

  for (let filled = 0; filled < MAX_AGENTS; filled += 1) {
    noteAgent(anAgent({ agentId: `flood${filled}`, cwd: `${MINE}${filled}` }));
  }

  // The port is unauthenticated and anything on this machine may post to it, so
  // a stranger past the cap is refused — but the agents already on the roster go
  // on reporting, which is what keeps a flood from pushing real work off the
  // panel.
  assert.throws(
    () => noteAgent(anAgent({ agentId: 'onetoomany' })),
    /200 live agents/,
    'the deck says what it is refusing and why',
  );
  assert.equal(
    noteAgent(anAgent({ agentId: 'flood0', cwd: `${MINE}0` })),
    false,
    'and an agent it already holds is still heard',
  );
});

test('the roster is never written to the store (L7)', async (t) => {
  const base = await deckOnAPort(t);
  ownRoster(t);
  registerRun({ repo: MINE, pid: process.pid });

  await heartbeat(base, anAgent());

  const written = fs.readFileSync(storeFile(), 'utf8');
  assert.doesNotMatch(written, /a1f78b7c83/, 'the agent id is nowhere in deck.json');
  assert.doesNotMatch(written, /pilot-implementer/, 'and neither is what it is');
});
