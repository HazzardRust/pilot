/**
 * Slice S1 of crew-handoff-trace: a hand-off's timeline and what it waits on (spec 2, 10).
 *
 * The 2026-11-19 fixture is the §3.1 table of docs/design/crew-handoff-trace/architecture.md
 * rebuilt as rows: seven crew rows on ticket itm_64084fb89990, and three rows of the pilot's own
 * hand-off itm_fa7aaaa382a7, which names no ticket and so is not on the ticket's timeline.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { STEPS, timeline, trace } from '../trace.mjs';

const TICKET = 'itm_64084fb89990';
const CREW = 'itm_7df7fdd3e4a3';
const at = (time) => `2026-11-19T${time}.000Z`;
const crew = (time, step, extra = {}) => ({ at: at(time), step, kind: 'crew-handoff', ticket: TICKET, ...extra });

const NOVEMBER_19 = [
  crew('07:29:01', 'posted', { item: CREW }),
  crew('07:29:53', 'stopped', { agent: 'a4a0177a' }),
  crew('07:30:04', 'released'),
  crew('07:30:07', 'granted'),
  crew('07:30:25', 'spawned', { agent: 'acf7b6eb' }),
  { at: at('08:08:47'), step: 'posted', kind: 'handoff', item: 'itm_fa7aaaa382a7' },
  { at: at('08:08:49'), step: 'handed', kind: 'handoff', item: 'itm_fa7aaaa382a7', session: '7cfa40fe' },
  crew('07:46:20', 'stopped', { agent: 'acf7b6eb' }),
  { at: at('08:08:57'), step: 'cleared', kind: 'handoff', item: 'itm_fa7aaaa382a7', session: '6aa1c273' },
  crew('08:08:31', 'released'),
];

test('the step order per kind is the spec 1 order', () => {
  assert.deepEqual(STEPS.crew, ['posted', 'stopped', 'released', 'granted', 'spawned', 'resolved', 'failed']);
  assert.deepEqual(STEPS.pilot, ['posted', 'handed', 'cleared', 'submitted', 'resolved', 'failed']);
});

test('an unfinished hand-off says what it waits on', () => {
  const rows = [{ at: '2026-11-21T10:00:00.000Z', step: 'posted', kind: 'crew-handoff', item: 'itm_aa' }];
  const seen = timeline(rows, 'itm_aa', Date.parse('2026-11-21T10:03:00.000Z'));
  assert.equal(seen.rows.length, 1);
  assert.equal(seen.tail, 'waiting: stopped, 3m');
});

test('the 11-19 sequence reads as released with no grant', () => {
  const seen = timeline(NOVEMBER_19, TICKET, Date.parse(at('09:13:19')));
  assert.equal(seen.rows.length, 7, 'the pilot hand-off names no ticket and is left out');
  assert.deepEqual(seen.rows.map((row) => row.at), [...seen.rows.map((row) => row.at)].sort(), 'in time order');
  assert.equal(seen.tail, 'waiting: granted, 1h05m');
});

test('a resolved or failed hand-off is done', () => {
  const posted = { at: '2026-11-21T10:00:00.000Z', step: 'posted', kind: 'handoff', item: 'itm_bb' };
  for (const last of ['resolved', 'failed']) {
    const rows = [posted, { at: '2026-11-21T10:01:00.000Z', step: last, kind: 'handoff', item: 'itm_bb' }];
    assert.equal(timeline(rows, 'itm_bb', Date.parse('2026-11-21T11:00:00.000Z')).tail, 'done');
  }
});

function traceRun(argv) {
  const out = [];
  const err = [];
  return trace(argv, { say: (text) => out.push(text), complain: (text) => err.push(text) }).then((code) => ({ code, out: out.join(''), err: err.join('') }));
}

test('pilot trace prints the rows then the tail from a file', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-trace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'handoff-trace.jsonl');
  fs.writeFileSync(file, `${JSON.stringify(NOVEMBER_19[0])}\nnot json\n\n${JSON.stringify(NOVEMBER_19[1])}\n`);
  const run = await traceRun([TICKET, '--file', file]);
  assert.equal(run.code, 0);
  const lines = run.out.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^2026-11-19T07:29:01\.000Z posted crew-handoff item=itm_7df7fdd3e4a3 ticket=itm_64084fb89990$/);
  assert.match(lines[1], /stopped .*agent=a4a0177a/);
  assert.match(lines[2], /^waiting: released, \d+h\d\dm$/);
});

test('pilot trace on a missing file says no rows and waits on posted', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-trace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = await traceRun(['itm_cc', '--file', path.join(dir, 'none.jsonl')]);
  assert.equal(run.code, 0);
  assert.equal(run.out, 'no trace rows for itm_cc\nwaiting: posted, 0m\n');
});

test('pilot trace refuses a bad id with exit 2', async () => {
  for (const argv of [[], ['../etc/passwd'], ['itm_aa', '--file'], ['itm_aa', '--bogus', 'x']]) {
    const run = await traceRun(argv);
    assert.equal(run.code, 2, JSON.stringify(argv));
    assert.match(run.err, /^pilot trace: usage: pilot trace <itm_id> \[--file <path>\]/);
    assert.equal(run.out, '');
  }
});
