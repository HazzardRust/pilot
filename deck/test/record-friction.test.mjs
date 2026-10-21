/**
 * S10 of yellow-lane: the run record's `friction` rows append and are bounded
 * (spec 20, 21; L8, A6).
 *
 * Each `deck_status` that sends `friction` adds its rows after the ones the record
 * already holds, never replacing them, so every session's rows reach the closing
 * report. A row is an agent row `{agent, what, evidence, size?}` or a drain row
 * `{kind: 'drain', what, size}`; anything else is refused. The record keeps the
 * newest 40, and the reply says how many of the oldest went.
 *
 * Every test takes its own store; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { registerRun, recordFor } = await import('../store.mjs');
const { RunRefusal, nextRecord, recordFields } = await import('../runs.mjs');
const { callTool } = await import('../server.mjs');

const row = (n) => ({ agent: 'pilot-implementer', what: `waited on the suite ${n}`, evidence: `npm test: ${n}s` });
const drain = (n) => ({ kind: 'drain', what: `re-read the artefact ${n}`, size: n });

test('rows append across calls', () => {
  const first = nextRecord({ slug: 'x' }, recordFields({ slug: 'x', friction: [row(1), drain(2)] }));
  const second = nextRecord(first, recordFields({ slug: 'x', friction: [{ ...row(3), size: 7 }] }));

  assert.deepEqual(second.friction, [row(1), drain(2), { ...row(3), size: 7 }], 'both calls\' rows, in order');
  const untouched = nextRecord(second, recordFields({ slug: 'x', next: 'merge S3' }));
  assert.deepEqual(untouched.friction, second.friction, 'a call without friction keeps the rows');
});

test('a malformed row is refused', () => {
  const refused = (friction, pattern) => assert.throws(() => recordFields({ slug: 'x', friction }), pattern);

  refused([row(1), { what: 'no agent', evidence: 'none' }], /friction\[1\]/);
  refused([{ kind: 'drain', what: 'no size' }], /friction\[0\]\.size/);
  refused([{ kind: 'leak', what: 'odd', size: 1 }], /friction\[0\]/);
  refused([{ ...row(1), colour: 'red' }], /friction\[0\]/);
  refused([{ ...row(1), size: 'big' }], /friction\[0\]\.size/);
  refused('slow', /friction/);
  refused([{ ...row(1), size: -1 }], /friction\[0\]\.size must be a number, 0 or more/);
  refused([drain(-1)], /friction\[0\]\.size/);
  assert.throws(() => recordFields({ slug: 'x', friction: [null] }), (err) => err instanceof RunRefusal && /friction\[0\]/.test(err.message),
    'a null row is a refusal, never a TypeError');
  assert.deepEqual(recordFields({ slug: 'x', friction: [{ ...row(1), size: 0 }, drain(0)] }).friction, [{ ...row(1), size: 0 }, drain(0)], 'size 0 is a size');
});

test('past 40 the oldest go, and the reply says the cap holds', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: 'D:/work/pilot', pid: process.pid });
  const status = (rows) => callTool('deck_status', { run: run.id, slug: 'x', slices: [], friction: rows }).content[0].text;

  const thirtyEight = Array.from({ length: 38 }, (_, n) => row(n));
  assert.doesNotMatch(status(thirtyEight), /keeps the newest/);
  const answer = status([row(38), row(39), row(40), row(41), row(42)]);

  const kept = recordFor('D:/work/pilot').friction;
  assert.equal(kept.length, 40);
  assert.deepEqual(kept[0], row(3), 'the three oldest went');
  assert.deepEqual(kept.at(-1), row(42), 'the newest stay');
  assert.match(answer, /; friction keeps the newest 40/);
  assert.doesNotMatch(callTool('deck_status', { run: run.id, slug: 'x', slices: [] }).content[0].text, /keeps the newest/, 'said only on a call that sends rows');
  assert.ok(Buffer.byteLength(answer) < 200, `${Buffer.byteLength(answer)} bytes`);
});

test('friction is written last, so a clipped record keeps next, finished and report', () => {
  const record = nextRecord({ slug: 'x' }, {
    ...recordFields({ slug: 'x', friction: [row(1)], next: 'merge S3' }),
    updatedAt: '2026-10-14T10:00:00.000Z',
  });
  assert.deepEqual(Object.keys(record), ['slug', 'next', 'updatedAt', 'friction']);
});
