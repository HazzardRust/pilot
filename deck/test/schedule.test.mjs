/**
 * S3 of co-pilot-successor (spec 6, 7, 8; L8, L9, L12): `startable` reads a record's slice rows the way
 * the graph draws them and names the slices that may start now, in graph order, at most `slots`, each
 * with the tip it branches from; `pilot ready` prints them.
 */

import './no-open.mjs';
import '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import { KIND_TICKET } from '../items.mjs';
import { registerRun } from '../store.mjs';
import { callTool } from '../server.mjs';
import { deckOnAPort, postStored, shapedTicketBody } from '../testUtils.mjs';
import { ready, startable } from '../schedule.mjs';

const REPO = path.resolve('D:/work/schedule');

/** S1 → S2 ‖ S3 → S4, and S9 after S1 (spec 6), with each row's state given. */
const graph = ({ s1 = 'integrated', s2 = 'planned', s3 = 'planned', s4 = 'planned', s9 = 'planned' } = {}) => [
  { slice: 'S1 skeleton', state: s1 },
  { slice: 'S2 left', state: s2, after: ['S1'] },
  { slice: 'S3 right', state: s3, after: ['S1'] },
  { slice: 'S4 join', state: s4, after: ['S2', 'S3'] },
  { slice: 'S9 aside', state: s9, after: 'S1' },
];
const names = (starts) => starts.map((start) => start.slice.split(' ')[0]);

test('S2, S3 and S9 start once S1 is integrated', () => {
  assert.deepEqual(startable(graph(), 5), [
    { slice: 'S2 left', from: 'feat' },
    { slice: 'S3 right', from: 'feat' },
    { slice: 'S9 aside', from: 'feat' },
  ]);
  assert.deepEqual(startable(graph({ s1: 'planned' }), 5), [{ slice: 'S1 skeleton', from: 'feat' }], 'nothing after S1 starts before it');
});

test('S4 waits for S2 and S3 only', () => {
  assert.deepEqual(names(startable(graph({ s2: 'integrated', s3: 'merged', s9: 'implementing' }), 5)), ['S4']);
  assert.deepEqual(startable(graph({ s2: 'integrated', s3: 'implementing', s9: 'planned' }), 5), [{ slice: 'S9 aside', from: 'feat' }], 'one blocker still doing holds S4');
});

test('three slots start three, two start two', () => {
  assert.deepEqual(names(startable(graph(), 3)), ['S2', 'S3', 'S9']);
  const two = names(startable(graph(), 2));
  assert.equal(two.length, 2);
  assert.ok(two.every((name) => ['S2', 'S3', 'S9'].includes(name)), two.join());
  assert.deepEqual(startable(graph(), 0), []);
});

test('row order does not decide', () => {
  // The rows listed first are blocked; a scheduler that takes the first planned rows and then
  // checks their blockers starts nothing at two slots.
  const rows = [
    { slice: 'S1', state: 'integrated' },
    { slice: 'S4', state: 'planned', after: ['S2', 'S3'] },
    { slice: 'S5', state: 'planned', after: ['S4'] },
    { slice: 'S2', state: 'implementing', after: ['S1'] },
    { slice: 'S3', state: 'implementing', after: ['S1'] },
    { slice: 'S9', state: 'planned', after: ['S1'] },
  ];
  assert.deepEqual(startable(rows, 2), [{ slice: 'S9', from: 'feat' }]);
  // A blocker listed below what it blocks still comes first.
  assert.deepEqual(names(startable([{ slice: 'S2', state: 'planned', after: ['S1'] }, { slice: 'S1', state: 'planned' }], 2)), ['S1']);
});

test('one slot starts the lowest S-number, never the first row', () => {
  // Spec 8: S9 and S3 are listed above S2, and all three are ready.
  const rows = [{ slice: 'S1', state: 'integrated' }, { slice: 'S9', state: 'planned', after: ['S1'] }, { slice: 'S3', state: 'planned', after: ['S1'] }, { slice: 'S2', state: 'planned', after: ['S1'] }];
  assert.deepEqual(startable(rows, 1), [{ slice: 'S2', from: 'feat' }]);
});

test('a row with an empty state counts as planned', () => {
  assert.deepEqual(startable([{ slice: 'S1', state: '' }], 1), [{ slice: 'S1', from: 'feat' }]);
});

test('a draft with no branch does not pipeline', () => {
  const rows = [{ slice: 'S1', state: 'draft PR #4' }, { slice: 'S2', state: 'planned', after: ['S1'] }];
  assert.deepEqual(startable(rows, 2), []);
  rows[0].branch = 'slice/x-s1';
  assert.deepEqual(startable(rows, 2), [{ slice: 'S2', from: 'slice/x-s1' }], 'and with one it does');
});

test('a single-blocker slice pipelines off a draft PR, a join does not', () => {
  const rows = graph({ s2: 'draft #12', s3: 'integrated' });
  rows[1].branch = 'slice/x-s2';
  rows.push({ slice: 'S5 stem', state: 'planned', after: ['S2'] });
  const starts = startable(rows, 5);
  assert.deepEqual(starts.find((start) => start.slice === 'S5 stem'), { slice: 'S5 stem', from: 'slice/x-s2' }, 'from the blocker\'s branch');
  assert.equal(starts.some((start) => start.slice === 'S4 join'), false, 'a join on one draft waits');
  assert.equal(startable(graph({ s2: 'implementing' }).concat({ slice: 'S5', state: 'planned', after: ['S2'] }), 5).some((start) => start.slice === 'S5'), false, 'implementing is not a draft');
});

test('a slice already doing or done is never startable', () => {
  for (const state of ['implementing', 'draft #3', 'fixing', 'in review', 'integrated', 'ready', 'merged', 'blocked on CI']) {
    assert.deepEqual(startable([{ slice: 'S1', state }], 3), [], state);
  }
});

/** `pilot ready` in REPO against the test's deck: its exit code and what it printed. */
async function cli(base, argv, cwd = REPO) {
  const out = [];
  const err = [];
  const code = await ready(argv, { cwd, url: base, say: (line) => out.push(line), complain: (line) => err.push(line) });
  return { code, out: out.join(''), err: err.join('') };
}

test('pilot ready prints the starts and exits 1 with no record', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const ticket = postStored({ kind: KIND_TICKET, title: 'Scheduled', body: shapedTicketBody(), repo: REPO, sliceCount: 5, state: 'yellow' });
  const bare = postStored({ kind: KIND_TICKET, title: 'Unrecorded', body: shapedTicketBody(), repo: REPO, sliceCount: 1, state: 'yellow' });
  callTool('deck_status', { run: run.id, slug: 'schedule', ticket: ticket.id, slices: graph() });

  assert.deepEqual(await cli(base, ['--ticket', ticket.id, '--slots', '3']), { code: 0, out: 'S2 from feat\nS3 from feat\nS9 from feat\n', err: '' });
  assert.equal((await cli(base, ['--ticket', ticket.id, '--slots', '0'])).out, 'none\n');
  const none = await cli(base, ['--ticket', bare.id, '--slots', '3']);
  assert.equal(none.code, 1);
  assert.equal(none.out, '');
  assert.equal(none.err.split('\n').length, 2, `one line: ${none.err}`);
  const down = await cli('http://127.0.0.1:9', ['--ticket', ticket.id, '--slots', '3']);
  assert.equal(down.code, 1);
  assert.equal(down.err.split('\n').length, 2, `one line: ${down.err}`);
});

test('pilot ready in a worktree reads the record its main checkout registered', async (t) => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-ready-git-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, 'main');
  const tree = path.join(root, 'tree');
  const git = (...args) => execFileSync('git', args, { cwd: main, stdio: 'ignore' });
  fs.mkdirSync(main);
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  git('worktree', 'add', '-q', '-b', 'tree', tree);

  const base = await deckOnAPort(t);
  const run = registerRun({ repo: main, pid: process.pid });
  const ticket = postStored({ kind: KIND_TICKET, title: 'From a worktree', body: shapedTicketBody(), repo: main, sliceCount: 5, state: 'yellow' });
  callTool('deck_status', { run: run.id, slug: 'tree', ticket: ticket.id, slices: graph() });

  assert.deepEqual(await cli(base, ['--ticket', ticket.id, '--slots', '1'], tree), { code: 0, out: 'S2 from feat\n', err: '' });
});
