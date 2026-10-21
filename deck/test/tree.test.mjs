/**
 * The field the graph is drawn from: `after`, the rows a slice comes after (L4, L5).
 *
 * What a table may say is a unit test against `newSliceTable` and
 * `mergeSliceTable`, because a refusal is the only thing standing between the
 * pilot and a graph that draws a design nobody asked for (D2): an `after`
 * naming nothing must not quietly draw as a first slice. The test that writes
 * goes through the store, because what it proves (that a credential cannot ride
 * into `deck.json` in an `after`) is a property of what is written down; it
 * takes its own store directory, so nothing here reaches the real store or port
 * 4321: this machine runs a real deck.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';

const { MAX_SLICE_CHARS, SliceRefusal, graphOf, mergeSliceTable, newSliceTable } = await import('../status.mjs');

const { registerRun, setSlices } = await import('../store.mjs');

const { TOOLS } = await import('../tools.mjs');

const deckStatus = TOOLS.find((tool) => tool.name === 'deck_status');

/** A refusal that names every one of `names`, for `assert.throws`. */
const refusalNaming = (...names) => (err) => {
  assert.ok(err instanceof SliceRefusal, String(err));
  for (const name of names) assert.match(err.message, name);
  return true;
};

test('after takes a list and stores it', () => {
  const table = newSliceTable([
    { slice: 'S1 Skeleton' },
    { slice: 'S2 Left', after: ['S1'] },
    { slice: 'S3 Right', after: ['S1'] },
    { slice: 'S4 Converge', after: ['S2', 'S3'] },
  ]);
  assert.deepEqual(table[3].after, ['S2', 'S3'], 'stored as given');
  assert.equal('after' in table[0], false, 'a row that comes first says nothing');

  const graph = graphOf(table);
  const into = graph.edges.filter((edge) => graph.dots[edge.to]?.id === 'S4').map((edge) => graph.dots[edge.from].id);
  assert.deepEqual(into.sort(), ['S2', 'S3'], 'S4 is drawn as a convergence');
});

test('a string after is upgraded on the next merge', () => {
  // A row as 0.7.20 stored it: one name, as a string.
  const stored = [{ slice: 'S1', state: 'merged' }, { slice: 'S2', state: 'draft', after: 'S1' }];
  const table = mergeSliceTable(stored, [{ slice: 'S1', state: 'integrated' }]);
  assert.deepEqual(table[1], { slice: 'S2', state: 'draft', after: ['S1'] });
  assert.deepEqual(newSliceTable(stored)[1].after, ['S1'], 'and a string sent fresh is stored as a list too');
});

test('an entry by identifier resolves', () => {
  assert.doesNotThrow(() => newSliceTable([{ slice: 'S2 Some title' }, { slice: 'S3 Next', after: ['S2'] }]));
  assert.doesNotThrow(() => newSliceTable([{ slice: 'S2 Some title' }, { slice: 'S3 Next', after: ['s2'] }]), 'ignoring case');
  assert.doesNotThrow(
    () => newSliceTable([{ slice: '1 Tabs And The Tree' }, { slice: '2', after: ['  1 tabs and the tree  '] }]),
    'or by full name',
  );
  assert.deepEqual(newSliceTable([{ slice: 'A' }, { slice: 'B', after: ['  A  '] }])[1].after, ['A'], 'trimmed as every cell is');
});

test('an empty list, a blank entry or a duplicate entry is refused, naming the row', () => {
  assert.throws(() => newSliceTable([{ slice: 'S1' }, { slice: 'S2 x', after: [] }]), refusalNaming(/S2 x/));
  assert.throws(() => newSliceTable([{ slice: 'S1' }, { slice: 'S2 x', after: ['S1', '  '] }]), refusalNaming(/S2 x/));
  assert.throws(() => newSliceTable([{ slice: 'S1' }, { slice: 'S2 x', after: '  ' }]), refusalNaming(/S2 x/));
  assert.throws(() => newSliceTable([{ slice: 'S1' }, { slice: 'S2 x', after: ['S1', 's1'] }]), refusalNaming(/S2 x/, /twice/));
  assert.throws(() => newSliceTable([{ slice: 'S1 A' }, { slice: 'S2 x', after: ['S1', 'S1 A'] }]), refusalNaming(/S2 x/, /twice/), 'one row by identifier and by name');
  // Not a name and not a list of them.
  // eslint-disable-next-line no-sparse-arrays
  for (const after of [1, null, {}, [1], [['S1']], [, 'S1'], ['x'.repeat(MAX_SLICE_CHARS + 1)]]) {
    assert.throws(() => newSliceTable([{ slice: 'S1' }, { slice: 'S2 x', after }]), refusalNaming(/S2 x/), JSON.stringify(after));
  }
});

test('an unknown entry or a cycle through any blocker is refused', () => {
  assert.throws(
    () => newSliceTable([{ slice: 'S2 after', after: ['S1', 'nope'] }, { slice: 'S1 tabs' }]),
    refusalNaming(/S2 after/, /nope/),
  );
  assert.throws(
    () => newSliceTable([{ slice: 'A', after: ['B'] }, { slice: 'B', after: ['A'] }]),
    refusalNaming(/A/, /B/),
  );
  // Through the second blocker, which a walk of the first alone never reaches.
  assert.throws(
    () => newSliceTable([{ slice: 'C' }, { slice: 'A', after: ['C', 'B'] }, { slice: 'B', after: ['A'] }]),
    (err) => refusalNaming(/A/, /B/)(err) && !/\bC\b/.test(err.message),
  );
  // A row that points into a cycle it does not close is not named.
  assert.throws(
    () => newSliceTable([{ slice: 'X', after: ['A'] }, { slice: 'A', after: ['B'] }, { slice: 'B', after: ['A'] }]),
    (err) => refusalNaming(/A/, /B/)(err) && !/X/.test(err.message),
  );
  // One row long, by name or by identifier.
  assert.throws(() => newSliceTable([{ slice: '2 after', after: ['2 AFTER'] }]), refusalNaming(/2 after/));
  assert.throws(() => newSliceTable([{ slice: 'S2 after', after: ['S2'] }]), refusalNaming(/S2 after/));
});

test('two rows with one identifier are refused', () => {
  assert.throws(() => newSliceTable([{ slice: 'S2 One' }, { slice: 'S2 Other' }]), refusalNaming(/S2 One/, /S2 Other/));
  assert.doesNotThrow(() => newSliceTable([{ slice: 'S2 One' }, { slice: 'S20 Other' }, { slice: 'Feature' }, { slice: 'Notes' }]));
});

test('delivers is accepted and not stored', (t) => {
  assert.deepEqual(newSliceTable([{ slice: 'S1', delivers: ['1 (leaves)'] }]), [{ slice: 'S1', state: '' }]);
  assert.deepEqual(
    mergeSliceTable([{ slice: 'S1', state: '', delivers: ['4'] }], []),
    [{ slice: 'S1', state: '' }],
    'nor kept from an old deck',
  );

  tempDeck(t);
  const run = registerRun({ repo: path.join('D:', 'work', 'pilot'), pid: process.pid });
  const { slices } = setSlices(run.id, [{ slice: 'S1', delivers: ['spec 1'] }]);
  assert.deepEqual(slices, [{ slice: 'S1', state: '' }]);
});

test('a credential that only appears in an after is refused, not written down (A6)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: path.join('D:', 'work', 'pilot'), pid: process.pid });

  // The slice is the token with its prefix shouted, which the deck's patterns are
  // case-sensitive enough to miss; the `after` is the token as a token, which
  // `sliceKey` says is the same slice. The scan has to read the second one too.
  assert.throws(
    () =>
      setSlices(run.id, [
        { slice: 'GHP_0123456789abcdefghijklmnopqrstuvwxyz' },
        { slice: 'the leak', after: ['ghp_0123456789abcdefghijklmnopqrstuvwxyz'] },
      ]),
    /looks like a GitHub token/,
  );
});

test("the schema's after is a list and delivers is gone", () => {
  const row = deckStatus.inputSchema.properties.slices.items;
  const after = row.properties.after ?? {};

  assert.equal(after.type, 'array', 'after is a list of the rows it comes after');
  assert.equal(after.items?.type, 'string');
  assert.equal(after.items?.maxLength, MAX_SLICE_CHARS, 'each held to the length of the name it must match');
  assert.match(String(after.description), /S<n>/, 'the schema says an entry may be an identifier');
  assert.equal('delivers' in row.properties, false, 'delivers is dropped (A2)');
  assert.deepEqual(row.required, ['slice'], 'after is optional: a slice that comes first sends none');
  assert.equal(row.additionalProperties, false, 'a row still takes nothing else');
  assert.match(deckStatus.description, /after draws the graph/);
  assert.doesNotMatch(deckStatus.description, /delivers/);
});
