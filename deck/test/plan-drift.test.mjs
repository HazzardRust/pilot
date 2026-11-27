/**
 * Plan drift at the first grant (never-stuck S2, spec 13; L2, L4, L7, L10): `planDrift` reads a signed plan against
 * `origin` in a real clone of a local bare origin, and `deck_ticket co-pilot` re-cuts a drifted plan in the same call.
 * Nothing reaches GitHub; every test takes its own store and its own copy of the repositories.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';
import { seed } from '../../scripts/test/lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { ownedFiles, planDrift } from '../recut.mjs';
import { addReply, coPilotFor, listItems, postItem, resolveItem } from '../store.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// A copy of a slice file the architect wrote (never-stuck S10), so the parser reads the real producer's format:
// three owned paths, one `(new)`. A copy, so editing the design doc never turns this red.
const SLICE = path.resolve(import.meta.dirname, 'fixtures/slice-owned.md');
const ARTEFACT = 'docs/design/x/architecture.md';

/**
 * A bare origin; `work`, the deck's clone on `feat/x`, holding a plan one commit past `pilot`, whose one slice file
 * is S10's; and `other`, a second clone on `pilot` that lands changes on origin as another session would. One seed
 * and two clones.
 */
function repos(t) {
  return gitFixture(t, 'plan-drift:repos', (root) => {
    const { origin, sha } = seed(root, [
      { branch: 'pilot', files: { 'deck/store-items.mjs': 'one\n' }, message: 'deck/store-items.mjs' },
      { branch: 'pilot', files: { 'deck/server-wait.mjs': 'one\n' }, message: 'deck/server-wait.mjs' },
      { branch: 'pilot', files: { 'docs/design/x/slices/S1.md': fs.readFileSync(SLICE, 'utf8') }, message: 'docs/design/x/slices/S1.md' },
      { branch: 'feat/x', from: 'pilot', files: { [ARTEFACT]: '# X\n' }, message: ARTEFACT },
    ]);
    const work = path.join(root, 'work');
    const other = path.join(root, 'other');
    git(root, 'clone', '-q', '-b', 'feat/x', origin, work);
    git(root, 'clone', '-q', '-b', 'pilot', origin, other);
    return { origin, work, other, pilotSha: sha.pilot, plan: { artefact: ARTEFACT, branch: 'feat/x', sha: sha['feat/x'] } };
  });
}

/** `other`, on origin's `pilot` as cloned, lands one change to `file` on it: each test lands once. */
function land({ other }, file) {
  fs.mkdirSync(path.join(other, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(other, file), `changed ${file}\n`);
  git(other, 'add', file);
  git(other, 'commit', '-q', '-m', file);
  git(other, 'push', '-q', 'origin', 'pilot');
}

/** Origin is unreachable: every fetch from `work` fails. */
const breakOrigin = ({ origin }) => fs.renameSync(origin, `${origin}.moved`);

/** A ticket in `repo` signed through its own gate1 at the plan, as the user signs one: yellow. */
function signed(repo, plan) {
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'drifting', body: shapedTicketBody('drifting'), repo });
  takeLive(ticket.id);
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...plan, locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return listItems().find((item) => item.id === ticket.id);
}

const reread = (id) => listItems().find((item) => item.id === id);
const ticketCall = async (id, action) => (await callTool('deck_ticket', { id, action })).content[0].text;

test("a slice's owned paths are read", () => {
  assert.deepEqual(ownedFiles(fs.readFileSync(SLICE, 'utf8')), ['deck/server-wait.mjs', 'deck/store-items.mjs', 'deck/test/default-taken.test.mjs']);
});

test('an owned file moved on pilot is drift, naming its slice', async (t) => {
  const fixture = repos(t);
  land(fixture, 'deck/store-items.mjs');
  assert.deepEqual(await planDrift(fixture.work, fixture.plan), { state: 'moved', files: ['deck/store-items.mjs'], slices: ['S1'] });
});

test('a force-pushed plan sha is gone', async (t) => {
  const fixture = repos(t);
  git(fixture.other, 'push', '-q', '-f', 'origin', `${fixture.pilotSha}:refs/heads/feat/x`);
  assert.deepEqual(await planDrift(fixture.work, fixture.plan), { state: 'gone', sha: fixture.plan.sha });
});

test('an untouched plan is ok; a non-owned change is ok', async (t) => {
  const fixture = repos(t);
  assert.deepEqual(await planDrift(fixture.work, fixture.plan), { state: 'ok' });
  land(fixture, 'deck/lanes.mjs');
  assert.deepEqual(await planDrift(fixture.work, fixture.plan), { state: 'ok' });
});

test('a first grant over drift goes live naming the drift', async (t) => {
  tempDeck(t);
  const fixture = repos(t);
  const ticket = signed(fixture.work, fixture.plan);
  land(fixture, 'deck/store-items.mjs');

  const said = await ticketCall(ticket.id, 'co-pilot');

  const line = 'Drift (first grant): deck/store-items.mjs owned by S1; plan kept, ticket yellow';
  assert.ok(said.startsWith(`Co-pilot ${ticket.id}: live. drift: ${line}.`), said);
  const stored = reread(ticket.id);
  assert.equal(stored.state, 'yellow');
  assert.equal(stored.recut, undefined);
  assert.equal(coPilotFor(fixture.work)?.ticket, ticket.id);
  assert.deepEqual(stored.replies.filter((message) => message.author === 'deck').map((message) => message.text), [line]);
  assert.ok(!Number.isNaN(Date.parse(stored.plan.grantedAt)), 'the grant is stamped');
});

test("a successor's grant skips the check", async (t) => {
  tempDeck(t);
  const fixture = repos(t);
  const ticket = signed(fixture.work, fixture.plan);
  assert.ok((await ticketCall(ticket.id, 'co-pilot')).startsWith(`Co-pilot ${ticket.id}: live. Yellow: `));
  const grantedAt = reread(ticket.id).plan.grantedAt;
  assert.ok(!Number.isNaN(Date.parse(grantedAt)), 'the first grant is stamped');
  await ticketCall(ticket.id, 'release');
  // With origin gone, a check would answer `drift unchecked`; the successor's grant runs no git at all.
  breakOrigin(fixture);

  const said = await ticketCall(ticket.id, 'co-pilot');

  assert.ok(said.startsWith(`Co-pilot ${ticket.id}: live. Yellow: `), said);
  assert.equal(reread(ticket.id).plan.grantedAt, grantedAt, 'only the first grant stamps');
});

test('git failing grants with a reason', async (t) => {
  tempDeck(t);
  const fixture = repos(t);
  breakOrigin(fixture);
  const drift = await planDrift(fixture.work, fixture.plan);
  assert.equal(drift.state, 'unchecked');
  assert.match(drift.reason, /^git fetch: /);
  // A plan field git could read as an option or a range never reaches git.
  for (const [field, value] of [['sha', '--all'], ['branch', '--upload-pack=x'], ['branch', 'a..b'], ['artefact', '-x']]) {
    assert.equal((await planDrift(fixture.work, { ...fixture.plan, [field]: value })).reason, `the plan has no ${field}`);
  }

  const ticket = signed(fixture.work, fixture.plan);
  const said = await ticketCall(ticket.id, 'co-pilot');

  assert.ok(said.startsWith(`Co-pilot ${ticket.id}: live. drift unchecked: git fetch: `), said);
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.equal(coPilotFor(fixture.work)?.ticket, ticket.id);
});

test("a command the repo's own config names is never run", async (t) => {
  const fixture = repos(t);
  const marker = path.join(path.dirname(fixture.work), 'ran').replaceAll('\\', '/');
  git(fixture.work, 'config', 'remote.origin.uploadpack', `echo ran > '${marker}'; git-upload-pack`);
  const drift = await planDrift(fixture.work, fixture.plan);
  assert.equal(fs.existsSync(marker), false, 'the planted upload-pack never ran');
  assert.deepEqual(drift, { state: 'unchecked', reason: "the repo's own config sets remote.origin.uploadpack" });
  git(fixture.work, 'config', '--unset', 'remote.origin.uploadpack');
  git(fixture.work, 'config', 'core.alternateRefsCommand', `echo ran > '${marker}'`);
  assert.equal((await planDrift(fixture.work, fixture.plan)).reason, "the repo's own config sets core.alternaterefscommand");
});
