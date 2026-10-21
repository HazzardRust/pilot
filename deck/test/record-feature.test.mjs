/**
 * S14 of lander: a run record keeps its own feature name, not the session's.
 * One session writes several slugs' records; each keeps the name its own call gave.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { registerRun, setSlices, recordFor } = await import('../store.mjs');

const rows = [{ slice: '1 a slice', state: 'doing' }];

const write = (run, name, slug) => setSlices(run.id, rows, name, { slug }).record;

test('a slug keeps its own feature name', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: 'D:/work/pilot', pid: process.pid });

  write(run, 'Alpha', 'a');
  write(run, 'Beta', 'b');
  const a = write(run, undefined, 'a');

  assert.equal(a.feature, 'Alpha', 'record a is not renamed by the later call that named b');
  const b = write(run, undefined, 'b');
  assert.equal(b.feature, 'Beta');
  assert.equal(recordFor('D:/work/pilot')?.slug, 'b', 'the newest write is the newest record');
});

test('a slug first written without a name stays unnamed', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: 'D:/work/pilot', pid: process.pid });

  write(run, 'Alpha', 'a');
  const c = write(run, undefined, 'c');

  assert.equal(c.feature, undefined, 'the session\'s name is not lent to a slug that was never named');
});
