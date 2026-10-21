/**
 * S2 of run-record: the run record lives in the deck store (spec 3, spec 10's
 * daemon half; L5, L6, L19, L20, ADR 0028).
 *
 * `deck_status` is the record's only writer. A call that names a `slug` upserts
 * the record keyed by the repository and that slug, merging the rows it names
 * over the stored table, and answers in one line (independence spec 22.2). With
 * a worktree named, the daemon writes the stored bytes to
 * `docs/design/<slug>/run.json` there itself. `GET /api/record?repo=` serves
 * the same record to the SessionStart hook. The record hangs off the store and
 * not off the run, so it outlives the session that wrote it.
 *
 * Every test takes its own store and port; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const { listRuns, recordFor, registerRun, setSlices } = await import('../store.mjs');
const { nextRecord, recordFields } = await import('../runs.mjs');
const { mergeSliceTable } = await import('../status.mjs');
const { callTool, TOOLS } = await import('../server.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

const exitedPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

/** A whole `deck_status` call of the shape the pilot sends at a hand-off. */
const handoffStatus = (run) => ({
  run: run.id,
  feature: 'run record',
  slug: 'run-record',
  branch: 'feat/run-record',
  artefact: 'docs/design/run-record/architecture.md',
  findings: ['kept: F1 drop the helper', 'dropped: F2 rename, not worth its diff'],
  next: 'S2 draft PR open; wait for its review, then integrate.',
  slices: [
    {
      slice: 'S1',
      state: 'integrated at 733afa1',
      branch: 'slice/1-author',
      worktree: 'C:/work/pilot-s1',
      pr: 75,
    },
    { slice: 'S2', state: 'draft', after: ['S1'], branch: 'slice/2-record', pr: 76 },
  ],
});

const served = async (base, repo) =>
  (await fetch(`${base}/api/record?repo=${encodeURIComponent(repo)}`)).json();

/**
 * A scratch repository and a worktree of it, the way git lays one out: the
 * repository's `.git` is a directory, the worktree's a file naming it.
 */
const aWorktree = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-wt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-feat');
  fs.mkdirSync(path.join(repo, '.git', 'worktrees', 'repo-feat'), { recursive: true });
  fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'repo-feat')}\n`);
  return { repo, worktree };
};
const mirrorIn = (worktree, slug = 'run-record') =>
  path.join(worktree, 'docs', 'design', slug, 'run.json');

test("deck_status's answer is one line under 200 bytes, and never echoes the record (spec 22.2)", async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  const answer = callTool('deck_status', handoffStatus(run));

  assert.equal(answer.content.length, 1, 'one block');
  const [{ text }] = answer.content;
  assert.match(text, /^D1: /);
  assert.doesNotMatch(text, /\n/, 'one line');
  assert.ok(Buffer.byteLength(text) < 200, `${Buffer.byteLength(text)} bytes`);
  assert.doesNotMatch(text, /feat\/run-record|updatedAt/, 'no echo of the record');
  assert.equal((await served(base, MINE)).record.slug, 'run-record', 'the record is stored all the same');
});

test('a call naming worktree has the daemon write run.json there, in the stored bytes (spec 22.2)', (t) => {
  tempDeck(t);
  const { repo, worktree } = aWorktree(t);
  const run = registerRun({ repo, pid: process.pid });

  const answer = callTool('deck_status', { ...handoffStatus(run), worktree });

  const bytes = `${JSON.stringify(recordFor(repo), null, 2)}\n`;
  assert.equal(fs.readFileSync(mirrorIn(worktree), 'utf8'), bytes);
  assert.equal(recordFor(repo).worktree, worktree, 'the record keeps the worktree');
  assert.match(answer.content[0].text, /run\.json written/);

  // The next call names none, and the record's worktree is where it goes.
  callTool('deck_status', { run: run.id, slug: 'run-record', slices: [{ slice: 'S2', state: 'merged' }] });
  assert.equal(fs.readFileSync(mirrorIn(worktree), 'utf8'), `${JSON.stringify(recordFor(repo), null, 2)}\n`);
  assert.equal(JSON.parse(fs.readFileSync(mirrorIn(worktree), 'utf8')).slices[1].state, 'merged');
});

test("a worktree that is not an absolute checkout of the run's own repository is refused, and nothing is written", (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const { worktree: someoneElses } = aWorktree(t);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-not-wt-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));

  for (const worktree of [someoneElses, plain, 'relative/dir', '']) {
    assert.throws(() => callTool('deck_status', { ...handoffStatus(run), worktree }), { name: 'DeckRefusal' });
  }
  assert.equal(recordFor(MINE), null);
  assert.equal(fs.existsSync(path.join(plain, 'docs')), false);
  assert.equal(fs.existsSync(path.join(someoneElses, 'docs')), false, 'another repository is never written');
});

test('the record holds every field the spec names, and no thread ids (L5, L6)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  callTool('deck_status', handoffStatus(run));
  const record = recordFor(MINE);

  assert.equal(record.slug, 'run-record');
  assert.equal(record.feature, 'run record');
  assert.equal(record.branch, 'feat/run-record');
  assert.equal(record.artefact, 'docs/design/run-record/architecture.md');
  assert.deepEqual(record.findings, [
    'kept: F1 drop the helper',
    'dropped: F2 rename, not worth its diff',
  ]);
  assert.equal(record.next, 'S2 draft PR open; wait for its review, then integrate.');
  assert.deepEqual(record.slices, [
    {
      slice: 'S1',
      state: 'integrated at 733afa1',
      branch: 'slice/1-author',
      worktree: 'C:/work/pilot-s1',
      pr: 75,
    },
    { slice: 'S2', state: 'draft', after: ['S1'], branch: 'slice/2-record', pr: 76 },
  ]);
  assert.equal(typeof record.updatedAt, 'string');
  assert.deepEqual(
    Object.keys(record).sort(),
    ['artefact', 'branch', 'feature', 'findings', 'next', 'slices', 'slug', 'updatedAt'],
    'nothing else: open threads are derived at read time, never stored',
  );
});

test('a later call updates only the rows it names and keeps every field it leaves out (spec 22.2)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  callTool('deck_status', handoffStatus(run));

  callTool('deck_status', {
    run: run.id,
    slug: 'run-record',
    next: 'integrate S2',
    slices: [{ slice: 's2', state: 'integrated' }, { slice: 'S3', after: ['S2'] }],
  });
  const record = recordFor(MINE);

  assert.deepEqual(record.slices, [
    handoffStatus(run).slices[0],
    { slice: 's2', state: 'integrated', after: ['S1'], branch: 'slice/2-record', pr: 76 },
    { slice: 'S3', state: '', after: ['S2'] },
  ], 'S1 untouched, S2 merged cell by cell, S3 appended');
  assert.equal(record.next, 'integrate S2', 'a field that was sent is replaced');
  assert.equal(record.branch, 'feat/run-record', 'one that was not is kept');
  assert.equal(record.feature, 'run record', 'and so is the name the run was given');
  assert.equal(record.findings.length, 2);
  assert.deepEqual(listRuns()[0].slices, record.slices, 'the page draws the same table');
});

test('a row sent with drop: true is removed, and a full table still lands as sent', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const full = handoffStatus(run);
  callTool('deck_status', full);
  callTool('deck_status', full);
  assert.deepEqual(recordFor(MINE).slices, full.slices, 'the same full table twice is that table');

  assert.throws(
    () => callTool('deck_status', { run: run.id, slug: 'run-record', slices: [{ slice: 'S1', drop: true }] }),
    { name: 'DeckRefusal', message: /S2 comes after S1/ },
    'a row another comes after cannot go alone',
  );
  assert.throws(
    () => callTool('deck_status', { run: run.id, slug: 'run-record', slices: [{ slice: 'S2', drop: 'yes' }] }),
    { name: 'DeckRefusal' },
  );
  callTool('deck_status', { run: run.id, slug: 'run-record', slices: [{ slice: 'S2', drop: true }] });
  assert.deepEqual(recordFor(MINE).slices.map((row) => row.slice), ['S1']);
});

test("a fresh session's partial table lands on the record's rows, not on an empty one", (t) => {
  tempDeck(t);
  callTool('deck_status', handoffStatus(registerRun({ repo: MINE, pid: exitedPid() })));
  const fresh = registerRun({ repo: MINE, pid: process.pid });

  callTool('deck_status', { run: fresh.id, slug: 'run-record', slices: [{ slice: 'S2', state: 'merged' }] });

  assert.deepEqual(recordFor(MINE).slices.map((row) => [row.slice, row.state]), [
    ['S1', 'integrated at 733afa1'],
    ['S2', 'merged'],
  ]);
});

test('the record outlives the run that wrote it', async (t) => {
  const base = await deckOnAPort(t);
  const gone = registerRun({ repo: MINE, pid: exitedPid() });
  callTool('deck_status', handoffStatus(gone));

  // Registering anywhere sweeps the dead run row, and its table with it.
  registerRun({ repo: THEIRS, pid: process.pid });

  const { record } = await served(base, MINE);
  assert.equal(record?.slug, 'run-record', 'the record is still served for its directory');
  assert.equal(record.slices.length, 2);
});

test('a directory with no record is served none, and one run is not served another\'s', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  callTool('deck_status', handoffStatus(run));

  assert.deepEqual(await served(base, THEIRS), { record: null, yellow: null, budget: 5, coPilot: null, lanes: { planning: 'planning: empty', concluding: 'concluding: empty', coPilot: 'co-pilot: none', stageClause: 'Planning: empty. Concluding: empty', yellowClause: 'Yellow: empty', refusal: null, blocked: null }, owed: [], work: { landings: 0, designs: 0, since: null } });
  const missing = await fetch(`${base}/api/record`);
  assert.equal(missing.status, 400, 'a request naming no directory is refused');
});

test('the newest record in a directory is the one served', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  callTool('deck_status', handoffStatus(run));
  callTool('deck_status', { run: run.id, slug: 'next-thing', slices: [] });

  assert.equal((await served(base, MINE)).record.slug, 'next-thing');
});

test('deck_status refuses a call naming no slug, and writes nothing (L7)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  assert.throws(() => callTool('deck_status', { run: run.id, slices: [{ slice: 'S1' }] }), {
    name: 'DeckRefusal',
    message: /slug/,
  });
  assert.equal(recordFor(MINE), null, 'no record');
  assert.ok(TOOLS.find((tool) => tool.name === 'deck_status').inputSchema.required.includes('slug'));
});

test('a record field out of shape is refused, and nothing is written', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const refused = (change) =>
    assert.throws(() => callTool('deck_status', { ...handoffStatus(run), ...change }), {
      name: 'DeckRefusal',
    });

  refused({ slug: 'Run Record' });
  refused({ slug: undefined, next: 'a next move with nowhere to go' });
  refused({ findings: ['F1 drop the helper'] });
  refused({ findings: Array.from({ length: 41 }, (_, i) => `kept: F${i}`) });
  refused({ next: 'x'.repeat(401) });
  refused({ next: 'resume with token = abcdefghijklmnopqrstuvwxyz' });
  refused({ slices: [{ slice: 'S1', pr: 0 }] });
  refused({ slices: [{ slice: 'S1', pr: '75' }] });
  refused({ slices: [{ slice: 'S1', worktree: 42 }] });

  assert.equal(recordFor(MINE), null, 'no refused call left a record behind');
});

test('a credential in a field the scan never listed by name is refused all the same (A6)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  // A slug is kebab-case, and so is an sk- key: the slug is a cell of this call
  // like any other, and the scan has to reach it without being told to.
  const slug = 'sk-abcdefghijklmnopqrstuvwx';

  assert.throws(() => setSlices(run.id, [{ slice: 'S1' }], undefined, { slug }), {
    name: 'DeckRefusal',
    message: /looks like an sk- API key/,
  });
  assert.equal(recordFor(MINE), null, 'nothing was written');
});

test('a slug that is not a kebab-case name of at most forty characters is refused', () => {
  const refused = (slug) =>
    assert.throws(() => recordFields({ slug }), { name: 'RunRefusal' }, JSON.stringify(slug));

  refused('x/../../y');
  refused(42);
  refused('a'.repeat(41));
  assert.deepEqual(recordFields({ slug: 'a'.repeat(40) }), { slug: 'a'.repeat(40) });
});

test('a blank or overlong cell, an undecided finding and a forty-first finding are each refused', () => {
  const refused = (given) =>
    assert.throws(() => recordFields({ slug: 'run-record', ...given }), { name: 'RunRefusal' });

  refused({ next: '   ' });
  refused({ next: 'x'.repeat(401) });
  refused({ findings: ['foo kept: x'] });
  refused({ findings: Array.from({ length: 41 }, (_, i) => `kept: F${i}`) });
  assert.equal(recordFields({ slug: 'run-record', next: 'x'.repeat(400) }).next.length, 400);
  assert.equal(
    recordFields({ slug: 'run-record', findings: Array.from({ length: 40 }, (_, i) => `kept: F${i}`) }).findings
      .length,
    40,
  );
});

// --- F5 of the independence fix round: four rules the suite exercised only
// indirectly, so a mutation of the line behind any one of them still passed. ---

test('recordFields refuses a worktree that is not absolute (runs.mjs)', () => {
  assert.throws(() => recordFields({ slug: 'run-record', worktree: 'relative/dir' }), {
    name: 'RunRefusal',
    message: /absolute/,
  });
  const worktree = path.join(os.tmpdir(), 'work', 'pilot');
  assert.equal(recordFields({ slug: 'run-record', worktree }).worktree, worktree);
});

test('nextRecord clears a stored finished when a call sends a next move and no finished (runs.mjs)', () => {
  const stored = { slug: 'run-record', finished: 'closing report posted' };

  const moved = nextRecord(stored, { next: 'one more fix' });
  assert.equal(moved.next, 'one more fix');
  assert.equal(moved.finished, undefined, 'still working, so the old finished cannot stand');

  const both = nextRecord(stored, { next: 'one more fix', finished: 'done again' });
  assert.equal(both.finished, 'done again', 'a call naming both keeps the one it sent');

  const untouched = nextRecord(stored, { branch: 'feat/x' });
  assert.equal(untouched.finished, 'closing report posted', 'a call with no next leaves finished alone');
});

test('mergeSliceTable refuses a call that names the same slice twice (status.mjs)', () => {
  assert.throws(() => mergeSliceTable([], [{ slice: 'S1' }, { slice: 'S1', state: 'draft' }]), {
    name: 'SliceRefusal',
    message: /S1 twice/,
  });
});

test('mergeSliceTable refuses a drop row with a blank slice name (status.mjs)', () => {
  assert.throws(() => mergeSliceTable([], [{ slice: '', drop: true }]), { name: 'SliceRefusal' });
  assert.throws(() => mergeSliceTable([], [{ slice: '   ', drop: true }]), { name: 'SliceRefusal' });
});

test("deck_status's schema carries the record's fields", () => {
  const status = TOOLS.find((tool) => tool.name === 'deck_status').inputSchema;

  for (const field of ['slug', 'ticket', 'branch', 'artefact', 'findings', 'next']) {
    assert.ok(status.properties[field], `${field} is declared`);
  }
  const row = status.properties.slices.items.properties;
  assert.equal(row.pr.type, 'integer');
  assert.equal(row.pr.minimum, 1);
  assert.equal(row.branch.type, 'string');
  assert.equal(row.worktree.type, 'string');
  assert.deepEqual(status.required, ['slices', 'slug']);
});

/** A ticket in `repo` whose gate1 is signed, carrying the plan that sign-off writes (ticket-states L5). */
const aPlannedTicket = (repo, slug) =>
  postStored({
    kind: 'ticket', title: slug, body: 'x', repo, sliceCount: 60, state: 'yellow',
    plan: { artefact: `docs/design/${slug}/architecture.md`, branch: `feat/${slug}`, sha: 'abc1234', slug, sliceCount: 2, gate1: 'itm_0a' },
  });

const servedFor = async (base, repo, ticket) =>
  fetch(`${base}/api/record?repo=${encodeURIComponent(repo)}&ticket=${encodeURIComponent(ticket)}`);

test('deck_status with ticket stores it on the record and the run.json mirror', (t) => {
  tempDeck(t);
  const { repo, worktree } = aWorktree(t);
  const run = registerRun({ repo, pid: process.pid });
  const ticket = aPlannedTicket(repo, 'run-record');

  callTool('deck_status', { ...handoffStatus(run), worktree, ticket: ticket.id });

  assert.equal(recordFor(repo).ticket, ticket.id);
  assert.deepEqual(Object.keys(recordFor(repo)).slice(0, 3), ['slug', 'feature', 'ticket'], 'stored in RECORD_ORDER');
  assert.equal(JSON.parse(fs.readFileSync(mirrorIn(worktree), 'utf8')).ticket, ticket.id);
  assert.equal(ticket.record, undefined, 'no copy of the record on the ticket (L5)');
  assert.throws(() => recordFields({ slug: 'run-record', ticket: 'not-an-id' }), { name: 'RunRefusal', message: /ticket/ });
});

test("the ticket route returns that ticket's record, not the newest", async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const first = aPlannedTicket(MINE, 'apple');
  const second = aPlannedTicket(MINE, 'pear');
  callTool('deck_status', { run: run.id, slug: 'apple', ticket: first.id, slices: [] });
  callTool('deck_status', { run: run.id, slug: 'pear', ticket: second.id, slices: [] });

  const { record, ticket } = await (await servedFor(base, MINE, first.id)).json();
  assert.equal(record.slug, 'apple');
  assert.equal(ticket.id, first.id);
  assert.deepEqual(ticket.plan, first.plan, 'the ticket comes with its plan');
  assert.equal((await (await servedFor(base, MINE, second.id)).json()).record.slug, 'pear');
  // Without ticket, none: the newest is an open yellow ticket's, and the main slot is never yellow (ADR 0087).
  // The route still serving a non-yellow newest record is pinned in yellow-resume.test.mjs.
  assert.equal((await served(base, MINE)).record, null, "without ticket, not a yellow ticket's record");
});

test('an unknown ticket id is refused by name', async (t) => {
  const base = await deckOnAPort(t);
  const elsewhere = aPlannedTicket(THEIRS, 'kettle');

  for (const id of ['itm_ffffff', elsewhere.id]) {
    const answer = await servedFor(base, MINE, id);
    assert.equal(answer.status, 400);
    assert.match((await answer.json()).error, new RegExp(id));
  }
  const ticket = aPlannedTicket(MINE, 'apple');
  const noRepo = await fetch(`${base}/api/record?ticket=${encodeURIComponent(ticket.id)}`);
  assert.equal(noRepo.status, 400, 'a ticket asked for with no repo');
  assert.match((await noRepo.json()).error, /repo must be the path/);
});
