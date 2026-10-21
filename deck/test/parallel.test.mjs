/**
 * S6 of run-chaining: parallel decks each chain their own runs (spec 5 via A5, 7, 10;
 * L3, L7). The pilot files a later run's ticket under a worktree with `deck_post`'s
 * `dir`, so the ticket belongs to that worktree's deck; `pilot run` there asks the
 * daemon to chain once at start, and `chainNext({ atStart })` starts the head ticket
 * when no run in that directory is unfinished. `deck/test/run.test.mjs` pins the
 * wrapper's one call. Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_HANDOFF, KIND_TICKET, sameRepo } from '../items.mjs';

const { listItems, postItem, registerRun, setSlices } = await import('../store.mjs');
const { chainNext } = await import('../chain.mjs');
const { callTool } = await import('../server.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch repository and a worktree of it, laid out as git lays one out. */
const aWorktree = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-par-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-run2');
  fs.mkdirSync(path.join(repo, '.git', 'worktrees', 'repo-run2'), { recursive: true });
  fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'repo-run2')}\n`);
  return { root, repo, worktree };
};

/**
 * The Tickets bookmark's own slice of a page, up to the next rail bookmark (or the
 * end of the strip). Not "up to the first `</details>`": a ticket's own nested spec
 * `<details class="body">` closes before the bookmark itself does, and would
 * truncate the slice there instead.
 */
const ticketsOn = async (base, repo) => {
  const page = await (await fetch(`${base}/?run=${encodeURIComponent(repo)}`)).text();
  const start = page.indexOf('<details class="tab" id="tickets">');
  if (start === -1) return '';
  const next = page.indexOf('<details class="tab" id="', start + 1);
  return page.slice(start, next === -1 ? page.indexOf('</aside>', start) : next);
};

test("a ticket posted with dir belongs to that worktree's deck", async (t) => {
  const base = await deckOnAPort(t);
  const { repo, worktree } = aWorktree(t);
  registerRun({ repo, pid: process.pid });
  registerRun({ repo: worktree, pid: process.pid });

  // As the stdio client sends it: `repo` is the posting session's own directory.
  callTool('deck_post', { kind: KIND_TICKET, sliceCount: 60, title: 'Run 2 of feature', body: shapedTicketBody('slices S4-S6'), repo, dir: worktree });

  const [ticket] = listItems().filter((item) => item.kind === KIND_TICKET);
  assert.ok(sameRepo(ticket.repo, worktree), "the ticket's repo is the worktree");
  assert.match(await ticketsOn(base, worktree), /Run 2 of feature/, "listed on the worktree's tab");
  assert.doesNotMatch(await ticketsOn(base, repo), /Run 2 of feature/, 'and not on the posting one');
});

test('a dir that is not a worktree of this repository is refused', async (t) => {
  tempDeck(t);
  const { root, repo, worktree } = aWorktree(t);
  const stranger = path.join(root, 'other');
  fs.mkdirSync(path.join(stranger, '.git'), { recursive: true });
  const post = (dir, kind = KIND_TICKET) => () => callTool('deck_post', { kind, title: 'Run 2', body: shapedTicketBody(), repo, dir });

  assert.throws(post(stranger), /dir must be the absolute path of a worktree of this repository/);
  assert.throws(post(path.join(root, 'nowhere')), /dir must be/);
  assert.throws(post('repo-run2'), /dir must be/, 'a relative path');
  assert.throws(post(42), /dir must be/);
  assert.throws(post(worktree, 'question'), /a question item takes no dir/, 'dir is for a ticket only');
  assert.equal(listItems().length, 0, 'nothing is stored on a refusal');
});

test('chainNext at start chains with no record, or a finished one, and not over an unfinished run', async (t) => {
  const REPO = path.resolve('D:/work/alpha');
  const aTicket = () => postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: REPO });
  const report = (run, finished) => setSlices(run.id, [], undefined, { slug: 'feature-one', finished });

  await t.test('no record', (inner) => {
    tempDeck(inner);
    const ticket = aTicket();
    const { handoff } = chainNext(REPO, { atStart: true });
    assert.equal(handoff?.kind, KIND_HANDOFF);
    assert.equal(handoff.next, ticket.id);
  });
  await t.test('a finished record, even an abandoned one (A5)', (inner) => {
    tempDeck(inner);
    report(registerRun({ repo: REPO, pid: process.pid }), 'abandoned by the user');
    aTicket();
    assert.ok(chainNext(REPO, { atStart: true }).handoff);
  });
  await t.test('an unfinished run', (inner) => {
    tempDeck(inner);
    report(registerRun({ repo: REPO, pid: process.pid }), undefined);
    aTicket();
    assert.deepEqual(chainNext(REPO, { atStart: true }), { handoff: null, reason: 'a run is unfinished' });
  });
  await t.test('without atStart only a clean finish chains, as before', (inner) => {
    tempDeck(inner);
    aTicket();
    assert.deepEqual(chainNext(REPO), { handoff: null, reason: 'not finished cleanly' });
  });
  await t.test('POST /api/chain runs it at start', async (inner) => {
    const base = await deckOnAPort(inner);
    aTicket();
    const answer = await fetch(`${base}/api/chain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: REPO }),
    });
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).handoff?.kind, KIND_HANDOFF);
    const again = await (await fetch(`${base}/api/chain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: REPO }),
    })).json();
    assert.deepEqual(again, { handoff: null, reason: 'no ticket' }, 'the ticket was taken once');
    const foreign = await fetch(`${base}/api/chain`, {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
      body: JSON.stringify({ repo: REPO }),
    });
    assert.equal(foreign.status, 403, 'a cross-site page cannot start a run');
  });
  await t.test('a bad body is refused with wording for the chain, not borrowed from /api/record (QA F5)', async (inner) => {
    const base = await deckOnAPort(inner);
    const answer = await fetch(`${base}/api/chain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(answer.status, 400);
    const body = await answer.json();
    assert.match(body.error, /repo must be the path of the repository/);
    assert.doesNotMatch(body.error, /record you want/, "not /api/record's own wording");
  });
});

test("SKILL.md's parallel branch names the worktree, the dir, and the walkthrough command", () => {
  const skill = fs.readFileSync(path.join(ROOT, 'agents/pilot.md'), 'utf8').replace(/\s+/g, ' ');
  const from = skill.indexOf('On parallel');
  assert.ok(from >= 0, 'no parallel branch in step 3');
  const branch = skill.slice(from, skill.indexOf('Ask only questions', from));
  assert.match(branch, /worktree per extra deck/);
  assert.match(branch, /`ticket`[^.]*`dir`/);
  assert.match(branch, /`walkthrough`[^.]*`cd <path> && pilot run`/);
});
