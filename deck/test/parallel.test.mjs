/**
 * S6 of run-chaining: parallel decks each chain their own runs (spec 7, 10; L3, L7).
 * The pilot files a later run's ticket under a worktree with `deck_post`'s `dir`, so
 * the ticket belongs to that worktree's deck. A session's start chains nothing
 * (handoff-mod L12). Every test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { KIND_TICKET, sameRepo } from '../items.mjs';

const { listItems, registerRun } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

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
