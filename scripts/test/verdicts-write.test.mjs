/**
 * S2 of architect-runs-red: `pilot verdicts <artefact>` writes §6's Verdict lines from the pilot's
 * verdict message, by the grammar the deck checks with (spec 2; L3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseVerdictMessage, unverdicted, verdictsOf, writeVerdicts } from '../verdicts.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PILOT = path.join(ROOT, 'bin/pilot.mjs');
const MESSAGE = fs.readFileSync(path.join(ROOT, 'fixtures/verdicts/message.txt'), 'utf8');
const ARTEFACT = fs.readFileSync(path.join(ROOT, 'fixtures/verdicts/architecture.md'), 'utf8');
const RECORD = {
  A1: 'stands',
  A2: 'stands — the user named it in the grilling',
  A3: 'overturned: the user wants the second option',
};

/** §7 onwards, untouched by any write. */
const outOfScope = (md) => md.slice(md.indexOf('## 7.'));

test('a message parses to its record', () => {
  assert.deepEqual(parseVerdictMessage(MESSAGE), RECORD);
  assert.throws(() => parseVerdictMessage('A1 Verdict: stands\nA2 stands\n'), /A2 stands/);
  assert.throws(() => parseVerdictMessage('A1 Verdict: overturned:\n'), /A1 Verdict: overturned:/);
  assert.throws(() => parseVerdictMessage('A1 Verdict: stands\nA1 Verdict: stands\n'), /A1/);
});

test('the fixture writes clean the first time', () => {
  assert.deepEqual(unverdicted(ARTEFACT), ['A1', 'A2']);
  const out = writeVerdicts(ARTEFACT, RECORD);
  assert.deepEqual(unverdicted(out), []);
  assert.deepEqual(verdictsOf(out), RECORD);
  assert.equal(outOfScope(out), outOfScope(ARTEFACT));
  assert.match(out, /- \*\*A1 First\.\*\* Default: one\. Trades: a little\.\n {2}Rejected: two\.\n {2}Verdict: stands\n- \*\*A2/);
  assert.equal(out.split('\n').filter((line) => line.includes('Verdict:')).length, 3);
});

test('writing twice is writing once', () => {
  const once = writeVerdicts(ARTEFACT, RECORD);
  assert.equal(writeVerdicts(once, RECORD), once);
  const crlf = ARTEFACT.replace(/\n/g, '\r\n');
  assert.equal(writeVerdicts(crlf, RECORD), once.replace(/\n/g, '\r\n'));
});

test('an id on one side only is refused', () => {
  const { A3: _dropped, ...short } = RECORD;
  assert.throws(() => writeVerdicts(ARTEFACT, short), /A3/);
  assert.throws(() => writeVerdicts(ARTEFACT, { ...RECORD, A7: 'stands' }), /A7/);
});

/** `pilot verdicts <file>` with `input` on stdin. */
const pilot = (input, ...args) => {
  const env = { ...process.env, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const run = spawnSync(process.execPath, [PILOT, 'verdicts', ...args], { input, encoding: 'utf8', env });
  return { code: run.status, out: run.stdout, err: run.stderr };
};

test('the command rewrites the file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdicts-write-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'architecture.md');

  fs.writeFileSync(file, ARTEFACT);
  assert.deepEqual(pilot(MESSAGE, file), { code: 0, out: '', err: '' });
  assert.equal(fs.readFileSync(file, 'utf8'), writeVerdicts(ARTEFACT, RECORD));

  fs.writeFileSync(file, ARTEFACT);
  const short = pilot('A1 Verdict: stands\nA2 Verdict: stands\n', file);
  assert.equal(short.code, 1);
  assert.match(short.err, /A3/);
  assert.equal(fs.readFileSync(file, 'utf8'), ARTEFACT);

  assert.equal(pilot(MESSAGE).code, 1, 'no artefact is a usage error');
  assert.equal(pilot(MESSAGE, path.join(dir, 'missing.md')).code, 1);
});

test('a bullet with two Verdict lines never matches a one-line record', () => {
  const stale = '    Verdict: stands — a stale verdict the message replaces';
  const twice = ARTEFACT.replace(stale, `${stale}\n    Verdict: overturned: later`);
  assert.notEqual(twice, ARTEFACT);
  const record = { ...RECORD, A3: 'stands — a stale verdict the message replaces' };
  assert.equal(verdictsOf(ARTEFACT).A3, record.A3, 'one line still matches');
  assert.notEqual(verdictsOf(twice).A3, record.A3);
});
