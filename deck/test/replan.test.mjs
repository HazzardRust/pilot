/**
 * Sticky approval (never-stuck S4, spec 15; L3, L5): a re-cut whose `docs/design/<slug>/` is textually unchanged keeps
 * its signature through `deck_ticket replan`, and a re-cut's gate1 says what changed. Real repositories in a temp dir,
 * two plan commits each; nothing fetches or reaches GitHub, and every test takes its own store.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { planUnchanged } from '../recut.mjs';
import { DeckRefusal, addReply, listItems, postItem, resolveItem, setCoPilot } from '../store.mjs';
import { recutTicket, replanTicket } from '../store-tickets.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';
const SLICE = 'docs/design/x/slices/S1.md';

/**
 * One repository with a plan at `first`; `same` is a later commit that changes only code outside the design dir, and
 * `changed` (off `first` too) one that edits the slice file.
 */
function repo(t) {
  return gitFixture(t, 'replan:repo', (root) => {
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', work);
    const write = (file, text) => {
      fs.mkdirSync(path.join(work, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), text);
      git(work, 'add', file);
      git(work, 'commit', '-q', '-m', file);
      return git(work, 'rev-parse', 'HEAD');
    };
    write(ARTEFACT, '# X\n');
    const first = write(SLICE, '# S1\n\n## Files owned\n\n- `deck/lanes.mjs`\n');
    const same = write('deck/lanes.mjs', 'landed on pilot\n');
    git(work, 'checkout', '-q', '-b', 'recut', first);
    const changed = write(SLICE, '# S1\n\n## Files owned\n\n- `deck/lanes.mjs`\n- `deck/wait.mjs`\n');
    return { work, first, same, changed };
  });
}

/** A ticket in `dir` signed at `sha` through its own gate1: yellow. */
function signed(dir, sha, artefact = ARTEFACT) {
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'stale plan', body: shapedTicketBody('stale plan'), repo: dir });
  takeLive(ticket.id);
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: dir, artefact, sha, branch: 'feat/x', locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return reread(ticket.id);
}

/** That ticket re-cut: red, marked from `sha`. */
const recut = (dir, sha, artefact) => recutTicket(signed(dir, sha, artefact).id, 're-cut check due: deck/lanes.mjs', ['deck/lanes.mjs']);

const reread = (id) => listItems().find((item) => item.id === id);
const gate1sOn = (id) => listItems().filter((item) => item.kind === KIND_GATE1 && item.ticket === id);
const replan = (id, sha, author) => callTool('deck_ticket', { id, action: 'replan', sha, ...(author ? { author } : {}) });
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('an unchanged design dir keeps the signature', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  assert.equal(await planUnchanged(work, first, same, 'x'), true);
  const ticket = recut(work, first);
  const before = gate1sOn(ticket.id).length;

  const stored = replanTicket(ticket.id, same);

  assert.equal(stored.state, 'yellow');
  assert.equal(stored.plan.sha, same, 'the plan stands at the new sha');
  assert.equal(stored.recut, undefined, 'the mark is cleared');
  assert.notEqual(stored.live, true);
  assert.equal(gate1sOn(ticket.id).length, before, 'no gate1 is posted');
  assert.deepEqual(reread(ticket.id).plan, stored.plan, 'returned as stored');
});

test('one changed slice file refuses the replan', async (t) => {
  tempDeck(t);
  const { work, first, changed } = repo(t);
  const ticket = recut(work, first);

  await assert.rejects(async () => replan(ticket.id, changed, 'pilot:pilot-architect'), refusedNaming(SLICE, first.slice(0, 7)));

  assert.equal(reread(ticket.id).state, 'red');
  assert.equal(reread(ticket.id).recut.from, first, 'the mark stays');
});

test('a gone old sha is never unchanged', async (t) => {
  const { work, same } = repo(t);
  assert.equal(await planUnchanged(work, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', same, 'x'), false);
  assert.equal(await planUnchanged(work, same, 'deadbee', 'x'), false, 'nor an unreadable new one');
});

test('a plan whose artefact is not under docs/design/<slug>/ is never unchanged', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = recut(work, first, 'docs/foo/PLAN.md');

  await assert.rejects(async () => replan(ticket.id, same), refusedNaming('docs/foo/PLAN.md', 'gate1'));
  assert.equal(reread(ticket.id).state, 'red');
});

test('a ticket never re-cut is never replanned', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = signed(work, first);

  await assert.rejects(async () => replan(ticket.id, same), refusedNaming(ticket.id, 're-cut', 'gate1'));
  assert.throws(() => replanTicket(ticket.id, same), refusedNaming(ticket.id, 're-cut', 'gate1'));
  assert.equal(reread(ticket.id).plan.sha, first, 'the signed plan is untouched');
});

test('a replanned plan is granted afresh, so its next grant checks drift again', (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = signed(work, first);
  setCoPilot(ticket.id, true);
  setCoPilot(ticket.id, false);
  assert.ok(reread(ticket.id).plan.grantedAt, 'the first grant stamped the plan');
  recutTicket(ticket.id, 're-cut check due: deck/lanes.mjs');

  assert.equal(replanTicket(ticket.id, same).plan.grantedAt, undefined);
});

test('a re-cut gate1 without the line is refused, with it accepted', (t) => {
  tempDeck(t);
  const { work, first, changed } = repo(t);
  const ticket = recut(work, first);
  takeLive(ticket.id);
  const gate1 = (body) => postItem({ kind: KIND_GATE1, title: 'Gate 1', body, repo: work, artefact: ARTEFACT, sha: changed, branch: 'feat/x', locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });

  assert.throws(() => gate1('The design, re-cut.'), refusedNaming(`a re-cut's gate1 lists what changed since ${first.slice(0, 7)}`));
  assert.equal(gate1sOn(ticket.id).filter((item) => item.resolution === undefined).length, 0, 'nothing stored');

  const posted = gate1(`The design, re-cut.\n\nChanged since ${first.slice(0, 7)}: S1 owns deck/wait.mjs too.`);
  assert.equal(posted.ticket, ticket.id);
});

test('only the architect or the pilot replans', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = recut(work, first);

  await assert.rejects(async () => replan(ticket.id, same, 'pilot:pilot-implementer'), refusedNaming('replan', 'pilot:pilot-implementer'));
  assert.equal(reread(ticket.id).state, 'red', 'the refusal wrote nothing');

  const said = (await replan(ticket.id, same, 'pilot:pilot-architect')).content[0].text;
  assert.equal(said, `Replanned ${ticket.id} at ${same.slice(0, 7)}: signed plan kept.`);
  assert.equal(reread(ticket.id).state, 'yellow');
});
