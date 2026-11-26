/**
 * Sticky approval (never-stuck S4, spec 15; L3, L5): a re-cut whose `docs/design/<slug>/` is textually unchanged keeps
 * its signature through `deck_ticket replan`, and a re-cut's gate1 says what changed. Real repositories in a temp dir,
 * two plan commits each; nothing fetches or reaches GitHub, and every test takes its own store.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';
import { seed } from '../../scripts/test/lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { numberedSections, planChanges } from '../recut.mjs';
import { DeckRefusal, addReply, coPilotFor, listItems, pivotTicket, postItem, resolveItem, setCoPilot } from '../store.mjs';
import { recutTicket, replanTicket } from '../store-tickets.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';
const SLICE = 'docs/design/x/slices/S1.md';

const SECTIONS = { 2: ['Spec', '| 1 | a yellow ticket moves |'], 3: ['Findings', 'The anchor is server-tools.mjs:228.'], 5: ['Locked decisions', '- **L1** One replan.'], 8: ['Slices', '| S1 | `deck/lanes.mjs` |'] };
/** An architecture.md with §2, §3, §5 and §8; `edits` maps a section number to its new body, null dropping it. */
const architecture = (edits = {}) => ['# X', '', ...Object.entries(SECTIONS).flatMap(([n, [title, body]]) => (edits[n] === null ? [] : [`## ${n}. ${title}`, '', edits[n] ?? body, '']))].join('\n');

/**
 * One repository with a plan at `first`; `same` is a later commit that changes only code outside the design dir, and
 * off `first` too: `changed` edits the slice file, `reworded` §3 and the slice file, `spec`, `locked` and `graph`
 * edit §2, §5 and §8, and `headless` drops §8.
 */
function repo(t) {
  return gitFixture(t, 'replan:repo', (root) => {
    // `first` is the plan's branch; `main` grows `same` from it, and each re-cut is a branch off it. One seed, one clone.
    const off = (branch, files) => ({ branch, from: 'first', files, message: branch });
    const { origin, sha } = seed(root, [
      { branch: 'first', files: { [ARTEFACT]: architecture(), [SLICE]: '# S1\n\n## Files owned\n\n- `deck/lanes.mjs`\n' }, message: 'plan' },
      { branch: 'main', from: 'first', files: { 'deck/lanes.mjs': 'landed on pilot\n' }, message: 'plan' },
      off('recut', { [SLICE]: '# S1\n\n## Files owned\n\n- `deck/lanes.mjs`\n- `deck/wait.mjs`\n' }),
      off('reworded', { [ARTEFACT]: architecture({ 3: 'The anchor is server-tools.mjs:240.' }), [SLICE]: '# S1, reworded\n\n## Files owned\n\n- `deck/lanes.mjs`\n' }),
      off('spec', { [ARTEFACT]: architecture({ 2: '| 1 | a red ticket moves |' }) }),
      off('locked', { [ARTEFACT]: architecture({ 5: '- **L1** Two replans.' }) }),
      off('graph', { [ARTEFACT]: architecture({ 8: '| S1 | `deck/wait.mjs` |' }) }),
      off('headless', { [ARTEFACT]: architecture({ 8: null }) }),
    ]);
    const work = path.join(root, 'work');
    git(root, 'clone', '-q', origin, work);
    const { first, main: same, recut: changed, reworded, spec, locked, graph, headless } = sha;
    return { work, first, same, changed, reworded, spec, locked, graph, headless };
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
  assert.deepEqual(await planChanges(work, first, same, 'x'), []);
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

test('a wording-only change passes', async (t) => {
  tempDeck(t);
  const { work, first, reworded } = repo(t);
  const ticket = signed(work, first);

  const said = (await replan(ticket.id, reworded, 'pilot:pilot-architect')).content[0].text;

  assert.equal(said, `Replanned ${ticket.id} at ${reworded.slice(0, 7)}: signed plan kept; reworded ${SLICE}, §3.`);
  assert.deepEqual([reread(ticket.id).state, reread(ticket.id).plan.sha], ['yellow', reworded]);
  assert.equal(reread(ticket.id).replies.at(-1).text, `Replanned at ${reworded.slice(0, 7)} by architect: reworded ${SLICE}, §3`);
});

test('a changed spec line, locked decision or slice graph takes a gate1', async (t) => {
  tempDeck(t);
  const fixture = repo(t);
  const ticket = signed(fixture.work, fixture.first);
  const replies = reread(ticket.id).replies.length;

  for (const [commit, section] of [['spec', '§2'], ['locked', '§5'], ['graph', '§8']]) {
    await assert.rejects(async () => replan(ticket.id, fixture[commit]), refusedNaming(section, `changed since ${fixture.first.slice(0, 7)}`, 'deck_ticket recut', `Changed since ${fixture.first.slice(0, 7)}:`));
  }
  assert.deepEqual([reread(ticket.id).state, reread(ticket.id).plan.sha, reread(ticket.id).replies.length], ['yellow', fixture.first, replies], 'the ticket is unchanged');
});

test('a headless artefact is never proven', async (t) => {
  tempDeck(t);
  const { work, first, headless } = repo(t);
  assert.equal(numberedSections(`${architecture()}\n## 5. Locked decisions\n\n- **L1** Two replans.\n`).get('5'), null, 'a section headed twice');
  const fenced = (after) => numberedSections(architecture({ 5: `\`\`\`\n## not a heading\n\`\`\`\n${after}` })).get('5');
  assert.notEqual(fenced('- **L1** One replan.'), fenced('- **L1** Two replans.'), 'an edit after a fenced ## is still read');
  const ticket = signed(work, first);

  await assert.rejects(async () => replan(ticket.id, headless), refusedNaming('§8', 'never proven unchanged'));
  assert.equal(reread(ticket.id).plan.sha, first);
});

test('a gone old sha is never unchanged', async (t) => {
  const { work, same } = repo(t);
  assert.equal(await planChanges(work, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', same, 'x'), null);
  assert.equal(await planChanges(work, same, 'deadbee', 'x'), null, 'nor an unreadable new one');
});

test('a plan whose artefact is not under docs/design/<slug>/ is never unchanged', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = recut(work, first, 'docs/foo/PLAN.md');

  await assert.rejects(async () => replan(ticket.id, same), refusedNaming('docs/foo/PLAN.md', 'gate1'));
  assert.equal(reread(ticket.id).state, 'red');
});

test('a yellow ticket moves to the merge commit', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = signed(work, first);
  setCoPilot(ticket.id, true);
  setCoPilot(ticket.id, false);
  const { grantedAt } = reread(ticket.id).plan;
  const before = gate1sOn(ticket.id).length;

  const said = (await replan(ticket.id, same)).content[0].text;

  assert.equal(said, `Replanned ${ticket.id} at ${same.slice(0, 7)}: signed plan kept.`);
  const stored = reread(ticket.id);
  assert.deepEqual([stored.state, stored.plan.sha, stored.plan.grantedAt], ['yellow', same, grantedAt]);
  assert.equal(gate1sOn(ticket.id).length, before, 'no gate1 is posted');
  assert.equal(stored.replies.at(-1).text, `Replanned at ${same.slice(0, 7)} by pilot: unchanged`);
});

test('a yellow replan of a live ticket keeps it live', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const ticket = signed(work, first);
  setCoPilot(ticket.id, true);
  // A yellow ticket is live while a co-pilot holds it (store-tickets.mjs:240: never `live` on a yellow one).
  const held = () => coPilotFor(work)?.ticket === ticket.id && coPilotFor(work).live === true;
  assert.ok(held(), 'the co-pilot holds the ticket');

  await replan(ticket.id, same);

  assert.equal(reread(ticket.id).state, 'yellow');
  assert.ok(held(), 'the replan kept its co-pilot');
});

test('a re-cut whose §3 is reworded passes and names §3', async (t) => {
  tempDeck(t);
  const { work, first, reworded } = repo(t);
  const ticket = recut(work, first);

  const said = (await replan(ticket.id, reworded)).content[0].text;

  assert.equal(said, `Replanned ${ticket.id} at ${reworded.slice(0, 7)}: signed plan kept; reworded ${SLICE}, §3.`);
  assert.deepEqual([reread(ticket.id).state, reread(ticket.id).recut], ['yellow', undefined]);
});

test('a ticket with no signed plan, or one a gate2 names, is never replanned', async (t) => {
  tempDeck(t);
  const { work, first, same } = repo(t);
  const built = signed(work, first);
  const gate2 = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Verdict: approve\nGate: 1210 pass, 0 fail', repo: work, pr: '#250', sha: first, ticket: built.id });
  pivotTicket(built.id);
  await assert.rejects(async () => replan(built.id, same), refusedNaming(built.id, gate2.id));
  assert.throws(() => replanTicket(built.id, same), refusedNaming(built.id, gate2.id));
  assert.equal(reread(built.id).plan.sha, first, 'the signed plan is untouched');

  const planning = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'unplanned', body: shapedTicketBody('unplanned'), repo: work });
  await assert.rejects(async () => replan(planning.id, same), refusedNaming(planning.id, 'gate1'));
  assert.throws(() => replanTicket(planning.id, same), refusedNaming(planning.id, 'gate1'));
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

test('a re-cut written while the replan reads git refuses the replan', async (t) => {
  tempDeck(t);
  const { work, first, same, changed } = repo(t);
  const ticket = recut(work, first);
  const pending = replan(ticket.id, same);
  takeLive(ticket.id);
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: `Re-cut.\n\nChanged since ${first.slice(0, 7)}: S1 owns deck/wait.mjs.`, repo: work, artefact: ARTEFACT, sha: changed, branch: 'feat/x', locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  recutTicket(ticket.id, 're-cut check due: deck/wait.mjs');

  await assert.rejects(pending, refusedNaming(ticket.id, 're-cut again'));
  assert.deepEqual([reread(ticket.id).state, reread(ticket.id).recut.from], ['red', changed], 'the newer re-cut stands');
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
