/**
 * Slice S2 of crew-handoff-trace (spec 1, 9): the deck writes its own trace rows, a grant, a release, a
 * resolve, the user's Handoff failed press and its own start. Every test reads the trace only through
 * `pilot trace`, so moving a row's write into the store keeps them. Each runs on a scratch deck, whose
 * directory is where `traceFile()` puts the trace, so no test reaches the real file.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HANDOFF_FAILED, KIND_CREW_HANDOFF, KIND_QUESTION, KIND_TICKET } from '../items.mjs';
import { postItem } from '../store.mjs';
import { trace } from '../trace.mjs';
import { deckOnAPort, freePort, postStored, postsTheChoice, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAEMON = path.join(ROOT, 'deck', 'daemon.mjs');
const REPO = path.join('D:', 'work', 'pilot');

const aCrewHandoff = () => ({ kind: KIND_CREW_HANDOFF, title: 'Handoff: pilot-implementer is past the mark', body: 'Brief a fresh agent.', repo: REPO });

async function traced(id) {
  const out = [];
  const code = await trace([id], { say: (text) => out.push(text), complain: (text) => out.push(text) });
  assert.equal(code, 0);
  return out.join('').trimEnd().split('\n');
}

const tool = async (base, name, args) => {
  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  const said = await answer.json();
  return said.content?.[0]?.text ?? said.error;
};

test('a grant and a release leave rows', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'building', body: shapedTicketBody('building'), repo: REPO, sliceCount: 60, state: 'yellow' });

  assert.match(await tool(base, 'deck_ticket', { id: ticket.id, action: 'co-pilot' }), /: live/);
  assert.match(await tool(base, 'deck_ticket', { id: ticket.id, action: 'release' }), /: released/);

  const lines = await traced(ticket.id);
  assert.match(lines[0], new RegExp(` granted crew-handoff ticket=${ticket.id}$`));
  assert.match(lines[1], new RegExp(` released crew-handoff ticket=${ticket.id}$`));
  assert.equal(lines.length, 3, 'two rows and the tail');
});

test('a release with no live co-pilot leaves no row', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'idle', body: shapedTicketBody('idle'), repo: REPO, sliceCount: 60, state: 'yellow' });

  assert.match(await tool(base, 'deck_ticket', { id: ticket.id, action: 'release' }), /no co-pilot is live here/);
  assert.deepEqual(await traced(ticket.id), [`no trace rows for ${ticket.id}`, 'no hand-off']);
});

test('resolving a crew-handoff leaves a row', async (t) => {
  const base = await deckOnAPort(t);
  const handoff = postItem(aCrewHandoff());
  const question = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'A or B.', repo: REPO, options: ['A', 'B'] });

  assert.match(await tool(base, 'deck_resolve', { id: handoff.id, resolution: 'picked up' }), /^Closed /);
  assert.match(await tool(base, 'deck_resolve', { id: question.id, resolution: 'A' }), /^Closed /);

  const lines = await traced(handoff.id);
  assert.match(lines[0], new RegExp(` resolved crew-handoff item=${handoff.id}$`));
  assert.match(lines.at(-1), /^waiting: spawned, \d+m$/, 'resolved by hand, never spawned');
  assert.deepEqual(await traced(question.id), [`no trace rows for ${question.id}`, 'no hand-off'], 'a question leaves nothing');
});

test("the user's press leaves a row", async (t) => {
  const stored = await postsTheChoice(t, aCrewHandoff(), HANDOFF_FAILED);

  const lines = await traced(stored.id);
  assert.match(lines[0], new RegExp(` failed crew-handoff item=${stored.id}$`));
  assert.equal(lines.at(-1), 'done');
});

test('the deck says what code it runs', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const child = spawn(process.execPath, [DAEMON], { env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) }, stdio: 'ignore' });
  const gone = new Promise((resolve) => child.once('exit', resolve));
  try {
    // The row lands after the port is bound; the trace is read until it names a deck or the deadline passes.
    const deadline = Date.now() + 20_000;
    let lines = await traced('itm_nothing');
    while (!lines[0].startsWith('deck: ') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      lines = await traced('itm_nothing');
    }
    assert.ok(lines[0].startsWith('deck: '), `the daemon traced no start within 20s: ${lines[0]}`);
    assert.equal(lines[0].slice(0, lines[0].lastIndexOf(' since ')), `deck: ${ROOT} ${version}`);
    assert.ok(Number.isFinite(Date.parse(lines[0].slice(lines[0].lastIndexOf(' since ') + 7))), 'stamped');
    assert.equal(lines[1], 'no trace rows for itm_nothing');
  } finally {
    // Before tempDeck's removal: on Windows a live child holds the directory.
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await gone;
  }
});
