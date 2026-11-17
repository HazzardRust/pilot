/**
 * Plan drift at the first grant (never-stuck S2, spec 13; L2, L4, L7, L10): `planDrift` reads a signed plan against
 * `origin` in a real clone of a local bare origin, and `deck_ticket co-pilot` re-cuts a drifted plan in the same call.
 * Nothing reaches GitHub; every test takes its own store and its own copy of the repositories.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

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
// A slice file the architect wrote, so the parser reads the real producer's format: three owned paths, one `(new)`.
const SLICE = path.resolve(import.meta.dirname, '../../docs/design/never-stuck/slices/S10.md');
const ARTEFACT = 'docs/design/x/architecture.md';

/**
 * A bare origin; `work`, the deck's clone, holding a plan on `feat/x` one commit past `pilot`, whose one slice file
 * is S10's; and `other`, a second clone that lands changes on origin as another session would.
 */
function repos(t) {
  return gitFixture(t, 'plan-drift:repos', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    const other = path.join(root, 'other');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    const write = (dir, file, text) => {
      fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
      git(dir, 'add', file);
      git(dir, 'commit', '-q', '-m', file);
    };
    write(work, 'deck/store-items.mjs', 'one\n');
    write(work, 'deck/server-wait.mjs', 'one\n');
    write(work, 'docs/design/x/slices/S1.md', fs.readFileSync(SLICE, 'utf8'));
    git(work, 'push', '-q', 'origin', 'HEAD:pilot');
    const pilotSha = git(work, 'rev-parse', 'HEAD');
    git(work, 'checkout', '-q', '-b', 'feat/x');
    write(work, ARTEFACT, '# X\n');
    git(work, 'push', '-q', 'origin', 'feat/x');
    git(root, 'clone', '-q', origin, other);
    return { origin, work, other, write, pilotSha, plan: { artefact: ARTEFACT, branch: 'feat/x', sha: git(work, 'rev-parse', 'HEAD') } };
  });
}

/** `other` lands one change to `file` on origin's `pilot`. */
function land({ other, write }, file) {
  git(other, 'fetch', '-q', 'origin');
  git(other, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  write(other, file, `changed ${file}\n`);
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

test('an owned file moved on pilot is drift', async (t) => {
  const fixture = repos(t);
  land(fixture, 'deck/store-items.mjs');
  assert.deepEqual(await planDrift(fixture.work, fixture.plan), { state: 'moved', files: ['deck/store-items.mjs'] });
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

test('the first grant re-cuts a drifted plan', async (t) => {
  tempDeck(t);
  const fixture = repos(t);
  const ticket = signed(fixture.work, fixture.plan);
  land(fixture, 'deck/store-items.mjs');

  const said = await ticketCall(ticket.id, 'co-pilot');

  assert.ok(said.startsWith(`Re-cut check due ${ticket.id}: deck/store-items.mjs; red, planning next.`), said);
  const stored = reread(ticket.id);
  assert.equal(stored.state, 'red');
  assert.deepEqual(stored.recut.files, ['deck/store-items.mjs']);
  assert.equal(stored.recut.from, fixture.plan.sha);
  assert.equal(coPilotFor(fixture.work), null, 'no co-pilot slot was written');
  assert.equal(stored.plan.grantedAt, undefined, 'a re-cut plan was never granted');
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

  const ticket = signed(fixture.work, fixture.plan);
  const said = await ticketCall(ticket.id, 'co-pilot');

  assert.ok(said.startsWith(`Co-pilot ${ticket.id}: live. drift unchecked: git fetch: `), said);
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.equal(coPilotFor(fixture.work)?.ticket, ticket.id);
});
