'use strict';

/**
 * Spec 8 (L13): "a closed thread" is spelled once on each side of the L35 line
 * (`deck/items.mjs` for the ESM daemon, `hooks/lib/deck.js` for the CommonJS hooks), and
 * this is the test that the two spellings agree; "the same directory" is `pathKey`, one function.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const hook = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');

const deckModule = (name) => import(pathToFileURL(path.join(__dirname, '..', '..', 'deck', name)).href);

const OURS = path.resolve(__dirname, 'join-fixture', 'repo');
const THEIRS = path.resolve(__dirname, 'join-fixture', 'other');
const WINDOWS = process.platform === 'win32';

/** The same path with every letter's case flipped, which only Windows folds. */
const flipCase = (dir) => dir.replace(/[A-Za-z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));

/** The same path with its separators turned the other way, which only Windows reads as one. */
const flipSlashes = (dir) => (WINDOWS ? dir.replace(/\\/g, '/') : dir.replace(/\//g, '\\'));

test('the case and slash cases answer the way each platform answers them', async () => {
  const items = await deckModule('items.mjs');
  assert.equal(items.sameRepo(flipCase(OURS), OURS), WINDOWS, 'letter case folds on Windows and nowhere else');
  assert.equal(items.sameRepo(flipSlashes(OURS), OURS), WINDOWS, 'a backslash is a separator on Windows only');
  assert.equal(items.sameRepo(THEIRS, OURS), false);
});

test('both sides agree on which threads are closed', async () => {
  const items = await deckModule('items.mjs');
  const threads = [
    ['open', { id: 'a' }],
    ['closed', { id: 'b', resolvedAt: '2026-09-23T00:00:00.000Z' }],
    ['closed with an empty stamp', { id: 'c', resolvedAt: '' }],
    ['missing', null],
    ['undefined', undefined],
  ];
  for (const [what, item] of threads) {
    assert.equal(hook.isClosed(item), !items.isOpen(item), `${what}: the hooks and the deck disagree`);
  }
  assert.equal(hook.isClosed({ resolvedAt: '2026-09-23T00:00:00.000Z' }), true);
  assert.equal(hook.isClosed({}), false);
});

test("a slice's Yours joins on the deck's key for the repository", async () => {
  const status = await deckModule('status.mjs');
  const items = await deckModule('items.mjs');
  const signOff = (repo) => ({ id: 'i1', kind: items.KIND_SIGNOFF, repo, slice: 'S1 thing', replies: [] });
  const row = { slice: 'S1 thing' };
  const joined = (itemRepo, runRepo) =>
    status.yoursFor({ repo: runRepo }, row, status.yoursIndex([signOff(itemRepo)])) !== null;

  assert.equal(joined(OURS, OURS), true);
  assert.equal(joined(OURS, THEIRS), false);
  // Case folds on Windows only: on Linux two directories differing by case are two repositories.
  assert.equal(joined(flipCase(OURS), OURS), WINDOWS);
  // A trailing separator (or a `..` step) is one repository on every platform, as `sameRepo` already says.
  assert.equal(joined(OURS + path.sep, OURS), true);
  // Slash direction is one repository on Windows, where joinKey once compared raw strings.
  assert.equal(joined(flipSlashes(OURS), OURS), WINDOWS);
  assert.equal(joined('', ''), false, 'an item with no repository joins nothing');
  assert.equal(joined(undefined, undefined), false);
  assert.equal(joined(42, 42), false, 'a repository that is not a string joins nothing');
});

test('the daemon and the hooks agree on the standing kinds', async () => {
  const items = await deckModule('items.mjs');
  for (const kind of [...items.KINDS, items.KIND_CHAT, items.KIND_USER, items.KIND_HANDOFF, 'made-up', undefined]) {
    const item = { id: 'a', kind };
    assert.equal(hook.isStanding(item), items.isStanding(item), `${kind}: the hooks and the deck disagree`);
  }
  assert.equal(hook.isStanding(null), items.isStanding(null));
  // A user thread (a created chat until 2026-09-28) is not the chat on either side.
  assert.equal(hook.isChat({ kind: items.KIND_USER }), false);
  assert.equal(hook.isChat({ kind: items.KIND_CHAT }), true);
  assert.deepEqual(items.KINDS.filter((kind) => hook.isStanding({ kind })).sort(), [...items.STANDING_KINDS].sort());
});

test('the daemon and the hooks agree on the record kinds', async () => {
  const items = await deckModule('items.mjs');
  for (const kind of [...items.KINDS, items.KIND_CHAT, items.KIND_USER, items.KIND_HANDOFF, 'made-up', undefined]) {
    const item = { id: 'a', kind };
    assert.equal(hook.isRecord(item), items.isRecord(item), `${kind}: the hooks and the deck disagree`);
  }
  assert.equal(hook.isRecord(null), items.isRecord(null));
  assert.deepEqual(items.KINDS.filter((kind) => hook.isRecord({ kind })).sort(), [...items.RECORD_KINDS].sort());
});

test('the hooks read a gate as signed exactly when the deck does', async () => {
  const items = await deckModule('items.mjs');
  const said = (text, from = 'user') => ({ from, text });
  const sequences = [
    ['Sign off', [said('Sign off')]],
    ['Sign off then typed', [said('Sign off'), said('tidy the branch')]],
    ['Sign off then Not yet', [said('Sign off'), said('Not yet')]],
    ['Not yet then typed "Not yet sure"', [said('Not yet'), said('Not yet sure')]],
    ['Sign off with a note', [said('Sign off\n\nnote')]],
    ['a note typed before Sign off', [said('Sign off\n\nnote'), said('Not yet\n\nwait'), said('Sign off')]],
    ['a non-user message "Sign off"', [said('Sign off', 'pilot')]],
    ['nothing said', []],
  ];
  for (const kind of [items.KIND_GATE1, items.KIND_GATE2]) {
    for (const [name, replies] of sequences) {
      const item = { id: 'g', kind, options: [items.SIGN_OFF, items.NOT_YET], replies };
      assert.equal(hook.isUnsignedGate(item), items.chosenOf(item) !== items.SIGN_OFF, `${kind}, ${name}: the hooks and the deck disagree`);
    }
  }
  assert.deepEqual(hook.GATE_PRESSES, items.buttonsFor(items.KIND_GATE1), 'the hooks name the gate buttons of the deck');
  assert.deepEqual(hook.GATE_PRESSES, items.buttonsFor(items.KIND_GATE2));
});

/**
 * Is this thread waiting on the pilot, as of some baseline sequence number? Only
 * `hooks/stop-gate.js` asks it now: `pilot wait` is a client of the daemon's
 * `deck_wait` (crew-waits A5), so the ESM side keeps no spelling of its own.
 */
test('the Stop gate knows which threads await the pilot', () => {
  const at = (seq) => ({ from: 'user', text: 'hi', seq });
  const cases = [
    ['a fresh user reply past the baseline', { replies: [at(5)] }, 2, true],
    ['a user reply at the baseline exactly', { replies: [at(2)] }, 2, false],
    ['a user reply older than the baseline', { replies: [at(1)] }, 2, false],
    ['the pilot spoke last', { replies: [at(5), { from: 'pilot', text: 'ok' }] }, 2, false],
    ['nothing said yet', { replies: [] }, 2, false],
    ['a closed thread', { replies: [at(5)], resolvedAt: '2026-09-23T00:00:00.000Z' }, 2, false],
    ['a reply with no sequence number', { replies: [{ from: 'user', text: 'hi' }] }, 2, false],
    // A pass that carried the user's unread replies over (spec 5) is read through to the
    // newest of them, so the thread still reads as waiting on the pilot even though the
    // very last message in the array is the pilot's own.
    ['a pilot pass carrying replies still past the baseline', {
      replies: [at(5), at(7), { from: 'pilot', text: 'handed off', carries: [5, 7] }],
    }, 2, true],
    ['a pilot pass carrying replies not past the baseline', {
      replies: [at(5), at(7), { from: 'pilot', text: 'handed off', carries: [5, 7] }],
    }, 7, false],
  ];
  for (const [what, given, baseline, expected] of cases) {
    const item = { id: 'a', ...given };
    assert.equal(hook.awaitsPilot(item, baseline), expected, what);
  }
  assert.equal(hook.awaitsPilot(null, 0), false);
  assert.equal(hook.awaitsPilot(undefined, 0), false);
});

/**
 * Red-phase grilling (ticket-states spec 17, L21): a question whose ticket is not live holds no
 * turn. `hooks/stop-gate.js` `awaitsUser` spells it once.
 */
test('the Stop gate knows which threads await the user', () => {
  const live = { id: 'itm_live', kind: 'ticket', live: true };
  const parked = { id: 'itm_parked', kind: 'ticket' };
  const closedLive = { id: 'itm_closed', kind: 'ticket', live: true, resolvedAt: '2026-10-01T00:00:00.000Z' };
  const all = [live, parked, closedLive];
  const cases = [
    ['a question on the live ticket', { kind: 'question', ticket: 'itm_live' }, true],
    ['a question on a parked ticket', { kind: 'question', ticket: 'itm_parked' }, false],
    ['a question on a closed ticket still marked live', { kind: 'question', ticket: 'itm_closed' }, false],
    ['a question on a ticket not in the list', { kind: 'question', ticket: 'itm_gone' }, false],
    ['a question naming no ticket', { kind: 'question' }, true],
    // A run can park its ticket and stop with its gate2 open (spec 16 d, e): it holds no turn.
    ['a gate2 on a parked ticket', { kind: 'gate2', ticket: 'itm_parked' }, false],
    ['a gate2 on the live ticket', { kind: 'gate2', ticket: 'itm_live' }, true],
    ['a gate1 on a parked ticket', { kind: 'gate1', ticket: 'itm_parked' }, true],
    ['a closed question on the live ticket', { kind: 'question', ticket: 'itm_live', resolvedAt: '2026-10-01T00:00:00.000Z' }, false],
    ['a ticket', { kind: 'ticket' }, false],
    ['the chat', { kind: 'chat' }, false],
  ];
  for (const [what, given, expected] of cases) {
    const item = { id: 'itm_q', ...given };
    assert.equal(stopGate.awaitsUser(item, ['itm_q'], all), expected, what);
  }
  assert.equal(stopGate.awaitsUser(null, ['itm_q'], all), false);
});

// L11 (co-pilot-tickets S2): the hooks' stored spellings live in one `STORED`, pinned here to the deck's.
test('the hooks spell the store as the deck does', async () => {
  const items = await deckModule('items.mjs');
  assert.equal(hook.STORED.kind, items.KIND_TICKET);
  // `TICKET_ID_FIELD` is not exported: read it as a question carries it, the one field holding an item id.
  const ids = items.specFor(items.KIND_QUESTION).fields.filter((field) => field.shape && field.shape.test('itm_0a'));
  assert.deepEqual(ids.map((field) => field.name), [hook.STORED.field]);
});

test('no hook spells a stored literal of its own', () => {
  const fs = require('node:fs');
  const hooks = path.join(__dirname, '..');
  const files = [
    ...fs.readdirSync(hooks).map((name) => path.join(hooks, name)),
    ...fs.readdirSync(path.join(hooks, 'lib')).map((name) => path.join(hooks, 'lib', name)),
  ].filter((file) => file.endsWith('.js') && file !== path.join(hooks, 'lib', 'deck.js'));
  const LITERALS = /'ticket'|"ticket"|\.ticket\b|\.coPilots?\b/;
  const found = files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, at) => (LITERALS.test(line) ? path.relative(hooks, file) + ':' + (at + 1) + ': ' + line.trim() : null))
    .filter(Boolean));
  assert.deepEqual(found, []);
});
