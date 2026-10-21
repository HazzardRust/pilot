'use strict';

/**
 * S2 of user-thread-listener: a pilot whose shell sits in a worktree is still held
 * on, and handed, its repository's replies (spec 6, L3), and a thread the user
 * opened or one on this run's live ticket is never offered as "another session's"
 * (spec 2, L6). Both hooks are driven in-process over a stubbed deck.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');
const inbox = require('../inbox-alert.js');

const REPO = path.resolve('/scratch/repo');
const WORKTREE = path.resolve('/scratch/repo-feat');
const OTHER = path.resolve('/scratch/other');

const answered = (id, kind, extra) => Object.assign({
  id: id, kind: kind, title: 'T ' + id, repo: REPO, owner: 'pilot',
  replies: [{ from: 'user', seq: 5, text: 'answer on ' + id }],
}, extra);

/** The deck hands back `items`, `record` answers per ticket id; the session arrived at seq 1. */
function stubDeck(t, { items = [], tickets: tickets = {}, posted = [], projectDir = REPO } = {}) {
  const saved = Object.assign({}, deck);
  const savedEnv = process.env.CLAUDE_PROJECT_DIR;
  const asked = [];
  deck.tool = async (name, args) => {
    asked.push({ name: name, args: args });
    return name === 'deck_wait' ? { replies: [] } : { items: items };
  };
  deck.record = async (repo, id) => {
    asked.push({ name: 'record', repo: repo, id: id });
    if (!tickets[id]) throw new Error('no ticket ' + id);
    return { record: null, ticket: tickets[id] };
  };
  deck.readState = () => ({ baseline: 1, cursor: 1 });
  deck.readPosted = () => posted;
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  t.after(() => {
    Object.assign(deck, saved);
    if (savedEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = savedEnv;
  });
  return asked;
}

const stop = () => stopGate.run({ session_id: 's', cwd: WORKTREE });

test('a Stop with cwd in a worktree and CLAUDE_PROJECT_DIR the repo blocks on the user\'s answered thread', async (t) => {
  const asked = stubDeck(t, { items: [answered('itm_u', 'user')] });
  const said = await stop();
  assert.equal(said && said.decision, 'block');
  assert.match(said.reason, /answer on itm_u/);
  assert.equal(asked.find((call) => call.name === 'deck_wait').args.repo, REPO, 'the fallback is asked for the project');
});

test('the reason for a user-opened thread never offers another session', async (t) => {
  for (const kind of ['user', 'chat']) {
    stubDeck(t, { items: [answered('itm_u', kind)] });
    const said = await stop();
    assert.doesNotMatch(said.reason, /another session/, kind);
    assert.match(said.reason, /The user opened itm_u in this repository: it is yours/, kind);
  }
});

test('a question stamped with another repository still stands aside', async (t) => {
  stubDeck(t, { items: [answered('itm_q', 'question', { repo: OTHER })] });
  assert.equal(await stop(), null);
});

test('a mixed hold of a user thread and a question on no live ticket keeps the escape for the question only', async (t) => {
  stubDeck(t, { items: [answered('itm_u', 'user'), answered('itm_q', 'question')] });
  const said = await stop();
  assert.equal(said.decision, 'block');
  assert.match(said.reason, /The user opened itm_u in this repository: it is yours/);
  assert.match(said.reason, /if you never posted itm_q, it belongs to another session/);
  assert.doesNotMatch(said.reason, /posted itm_u/);
});

test('a question on this repository\'s live ticket that this session never posted never offers another session', async (t) => {
  const asked = stubDeck(t, {
    items: [answered('itm_q', 'question', { ticket: 'itm_t' })],
    tickets: { itm_t: { id: 'itm_t', kind: 'ticket', live: true } },
  });
  const said = await stop();
  assert.equal(said && said.decision, 'block');
  assert.doesNotMatch(said.reason, /another session/);
  assert.match(said.reason, /itm_q is on this run's ticket: it is yours/);
  assert.deepEqual(asked.filter((call) => call.name === 'record').map((call) => [call.repo, call.id]), [[REPO, 'itm_t']]);
});

test('a question on a ticket that is not live keeps the escape', async (t) => {
  stubDeck(t, {
    items: [answered('itm_q', 'question', { ticket: 'itm_t' })],
    tickets: { itm_t: { id: 'itm_t', kind: 'ticket', live: false } },
  });
  const said = await stop();
  assert.equal(said.decision, 'block');
  assert.match(said.reason, /if you never posted this, it belongs to another session/);
});

/** The inbox lane's deck: one reply of REPO's waiting past the cursor. */
function stubInbox(t, projectDir) {
  const asked = stubDeck(t, { projectDir: projectDir });
  const moved = [];
  deck.tool = async (name, args) => {
    asked.push({ name: name, args: args });
    return { seq: 5, replies: [{ itemId: 'itm_u', title: 'Mine', kind: 'user', owner: 'pilot', repo: REPO, seq: 5, text: 'the reply' }] };
  };
  deck.claim = () => true;
  deck.unclaim = () => {};
  deck.advanceCursor = (session, seq) => moved.push(seq);
  return { asked, moved };
}

test('a PostToolUse with cwd in a worktree delivers the repo\'s reply instead of reading past it', async (t) => {
  const { asked, moved } = stubInbox(t, REPO);
  const said = await inbox.run({ session_id: 's', cwd: WORKTREE, tool_name: 'Bash' });
  assert.ok(said && /the reply/.test(said.additionalContext), 'the reply is handed over');
  assert.deepEqual(moved, [], 'the cursor waits for the harness to take it');
  assert.equal(asked[0].args.repo, REPO);
});

test('with CLAUDE_PROJECT_DIR empty the hooks key on cwd as before', async (t) => {
  assert.equal(deck.projectDir({ cwd: WORKTREE }, { CLAUDE_PROJECT_DIR: '' }), WORKTREE);
  assert.equal(deck.projectDir({ cwd: WORKTREE }, {}), WORKTREE);
  assert.equal(deck.projectDir({ cwd: WORKTREE }, { CLAUDE_PROJECT_DIR: REPO }), REPO);

  const { moved } = stubInbox(t, '');
  assert.equal(await inbox.run({ session_id: 's', cwd: WORKTREE, tool_name: 'Bash' }), null, 'the worktree is not the repo');
  assert.deepEqual(moved, [5], 'and reads past what is not its own, as before');

  stubDeck(t, { items: [answered('itm_u', 'user')], projectDir: '' });
  assert.equal(await stop(), null);
  assert.equal((await stopGate.run({ session_id: 's', cwd: REPO })).decision, 'block');
});
