/**
 * project-glossary S2 (spec 9; L11): a word looks up its glossary entry, never the whole file.
 * Every test goes through `matchGlossary`, `termOf` or the `glossary.mjs match` CLI, over the
 * root `GLOSSARY.md` and S1's fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { matchGlossary, termOf } from '../glossary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = 'scripts/test/fixtures/glossary/path-entry.md';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const GLOSSARY = read('GLOSSARY.md');
const cli = (...args) =>
  spawnSync(process.execPath, ['scripts/glossary.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('an Avoid word names its canonical entry', () => {
  const hits = matchGlossary('the subagents finished', GLOSSARY);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].term, 'Crew');
  assert.equal(hits[0].via, 'avoid');
  assert.match(hits[0].entry, /^\*\*Crew\*\*:/);
});

test('a term hits by its own name', () => {
  const hits = matchGlossary('take the base now', GLOSSARY);
  // the longest name consumes its words: `Base` does not hit on the "base" of "take the base".
  assert.deepEqual(
    hits.map(({ term, via }) => [term, via]),
    [['Take the base', 'term'], ['Sync', 'avoid']],
  );
  assert.deepEqual(
    matchGlossary('base base base', GLOSSARY).map(({ term }) => term),
    ['Base'],
    'an entry once',
  );
});

test('a word with no entry gives nothing', () => {
  assert.deepEqual(matchGlossary('hello world', GLOSSARY), []);
  assert.deepEqual(matchGlossary('', GLOSSARY), []);
  // whole words only: "base" inside "database" is not the Base entry.
  assert.deepEqual(matchGlossary('the databases', read(FIXTURE)), []);
  assert.deepEqual(
    matchGlossary('a dirty terminal', read(FIXTURE)).map(({ term }) => term),
    [],
  );
  assert.deepEqual(
    matchGlossary('DIRTY TERM here', read(FIXTURE)).map(({ term, via, word }) => [term, via, word]),
    [['Clean term', 'avoid', 'Dirty term']],
  );
});

test('the lookup is small', () => {
  assert.ok(GLOSSARY.split('\n').length >= 300);
  const run = cli('match', 'the subagents');
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^Crew \(via Subagents\)\n/);
  assert.ok(run.stdout.trimEnd().split('\n').length < 6, run.stdout);
  const none = cli('match', 'hello', 'world');
  assert.equal(none.status, 0);
  assert.equal(none.stdout, '');
});

test('term by an Avoid word', () => {
  assert.match(termOf('Orchestrator', GLOSSARY), /^\*\*Pilot\*\*:\n[\s\S]*_Avoid_:[^\n]*Orchestrator/);
  assert.equal(termOf('nothing', GLOSSARY), null);
  // a name that is one entry's term and another's Avoid word is the entry it names.
  assert.match(termOf('sync', GLOSSARY), /^\*\*Sync\*\*:/);
  const run = cli('term', 'nothing', '--file', FIXTURE);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, 'no entry for nothing\n');
  assert.equal(cli('term', 'located term', '--file', FIXTURE).stdout.split('\n')[0], '**Pathy term**:');
});

test('a lookup with no words or no readable file exits 2', () => {
  assert.equal(cli('match').status, 2);
  assert.equal(cli('term', '--file', FIXTURE).status, 2);
  assert.equal(cli('match', 'x', '--file').status, 2);
  const unreadable = cli('match', 'x', '--file', 'no-such-glossary.md');
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /cannot read no-such-glossary\.md/);
});

test('a long argument is matched in linear time', () => {
  // every word starts a name ("take the base") that fails on its third word.
  const long = 'take the '.repeat(200_000);
  const started = performance.now();
  assert.deepEqual(matchGlossary(long, GLOSSARY), []);
  assert.ok(performance.now() - started < 2000);
});
