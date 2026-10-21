/**
 * QA resumed on demand (ticket-states spec 19, L5, L6): `deck_status` stores where a ticket's QA
 * ran (`qa: {branch, worktree, url}`) on its record, the ticket route returns it, and a reply on a
 * parked green ticket's walkthrough is handed to the live pilot through `deck_wait`, naming the ticket.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { addReply, parkTicket, postItem, recordFor, registerRun } from '../store.mjs';
import { callTool } from '../server.mjs';
import { deckOnAPort, postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const QA = 'pilot:pilot-qa';
const ALPHA = path.resolve('D:/work/alpha');

/** A scratch repository with two worktrees of it, the feature's and QA's, laid out as git lays them. */
const aRepo = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-qa-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const tree = (name) => {
    fs.mkdirSync(path.join(repo, '.git', 'worktrees', name), { recursive: true });
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', name)}\n`);
    return path.join(root, name);
  };
  return { repo, feature: tree('repo-feat'), qa: tree('repo-qa') };
};

const aTicket = (repo, state = 'yellow') => postStored({ kind: KIND_TICKET, title: 'The ticket', body: shapedTicketBody(), repo, sliceCount: 60, state });
const status = (run, extra) => callTool('deck_status', { run: run.id, slug: 'qa-resume', slices: [], ...extra });

test('deck_status stores qa refs on the record', (t) => {
  tempDeck(t);
  const { repo, feature, qa } = aRepo(t);
  const run = registerRun({ repo, pid: process.pid });
  const refs = { branch: 'feat/qa-resume', worktree: qa, url: 'http://127.0.0.1:4415' };

  status(run, { worktree: feature, qa: refs });
  assert.deepEqual(recordFor(repo).qa, refs);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(feature, 'docs', 'design', 'qa-resume', 'run.json'), 'utf8')).qa, refs, 'mirrored');

  status(run, { next: 'wait' });
  assert.deepEqual(recordFor(repo).qa, refs, 'left out, kept');

  const refused = (qaRefs, word) => assert.throws(() => status(run, { qa: qaRefs }), (error) => error.message.includes(word), word);
  refused({ ...refs, url: 'https://example.com/' }, 'url');
  refused({ ...refs, url: 'not a url' }, 'url');
  refused({ ...refs, url: 'http://u:p@127.0.0.1:4415' }, 'url');
  refused({ ...refs, branch: '--upload-pack=x' }, 'branch');
  refused({ ...refs, worktree: 'relative/qa' }, 'worktree');
  refused({ ...refs, worktree: os.tmpdir() }, 'worktree');
  refused({ branch: refs.branch, url: refs.url }, 'qa.worktree');
  refused({ ...refs, pid: 1 }, 'pid');
  assert.deepEqual(recordFor(repo).qa, refs, 'nothing refused was stored');
});

test('a reply on a parked green ticket\'s walkthrough reaches the live pilot with its ticket id', async (t) => {
  const base = await deckOnAPort(t);
  const wait = async (author) => {
    const args = { repo: ALPHA, since: 0, timeout: 50, ...(author && { author }) };
    const response = await fetch(`${base}/api/tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'deck_wait', arguments: args }) });
    return JSON.parse((await response.json()).content[0].text).replies;
  };

  const parked = aTicket(ALPHA);
  takeLive(parked.id);
  const walk = postItem({ kind: KIND_WALKTHROUGH, title: 'Try it', body: 'Step one.', repo: ALPHA, author: QA, ticket: parked.id });
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: ALPHA, pr: '#1', sha: '0305827', ticket: parked.id });
  // Already parked: a yellow ticket is never in the main slot (yellow-agent S4, ADR 0087).

  // Green, so it stays in the main slot: a yellow ticket is never live there (yellow-agent S4, ADR 0087).
  const live = aTicket(ALPHA, 'green');
  takeLive(live.id);
  const liveWalk = postItem({ kind: KIND_WALKTHROUGH, title: 'Try this one', body: 'Step one.', repo: ALPHA, author: QA, ticket: live.id });

  addReply(walk.id, 'Step one failed: the page is blank.');
  addReply(liveWalk.id, 'Step one worked.');

  assert.deepEqual((await wait(QA)).map((reply) => [reply.itemId, reply.ticket]), [[liveWalk.id, undefined]], "QA hears the live ticket's thread and not the parked one's");
  const pilots = await wait();
  assert.deepEqual(pilots.map((reply) => [reply.itemId, reply.ticket, reply.text]), [[walk.id, parked.id, 'Step one failed: the page is blank.']]);

  // QA's own reply, handed to it while the ticket was live, stays QA's once the ticket parks.
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: ALPHA, pr: '#2', sha: '0305827', ticket: live.id });
  parkTicket(live.id);
  assert.deepEqual((await wait()).map((reply) => reply.itemId), [walk.id], 'the pilot is not handed what QA already had');
});

test('the ticket route returns the qa refs', async (t) => {
  const base = await deckOnAPort(t);
  const { repo, qa } = aRepo(t);
  const run = registerRun({ repo, pid: process.pid });
  const ticket = aTicket(repo, 'green');
  const refs = { branch: 'feat/qa-resume', worktree: qa, url: 'http://localhost:4415/' };
  status(run, { ticket: ticket.id, qa: refs });

  const served = await (await fetch(`${base}/api/record?repo=${encodeURIComponent(repo)}&ticket=${ticket.id}`)).json();
  assert.deepEqual(served.record.qa, refs);
  assert.equal(served.ticket.id, ticket.id);
  assert.equal('qa' in served.ticket, false, 'no QA refs copied onto the ticket');
});
