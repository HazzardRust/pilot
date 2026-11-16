/**
 * The deck writes the feature PR (deck-writes-github S2; spec 2, 7; L1, L4, L5). A gate1 post and every
 * `deck_status` of a ticket with a gate1 spawn `node <bin>/pilot.mjs pr --ticket <id>` in the repository,
 * no shell; triggers coalesce per ticket, and a failure is one line on the ticket's thread. Every spawn
 * here is injected: no test lets a real `pilot pr` run.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_GATE1 } from '../items.mjs';
import { startPrWrite } from '../pr-writes.mjs';
import { listItems, postItem, registerRun, resolveItem } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');
const ARCHITECT = 'pilot:pilot-architect';
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' };
const deckLines = (id) => listItems().find((item) => item.id === id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/** A directory that is not a git repository, so the gate1's lineage is not read (gate1-lineage). */
function plainRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-writes-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
}

/** The evidence of a gate1 on a live red ticket in `repo`, its merge decision taken first (merge-first). */
function gate1Evidence(repo) {
  const evidence = withTicket({ ...GATE1 }, repo);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo, ticket: evidence.ticket, author: ARCHITECT }).id, 'merged nothing', ARCHITECT);
  return evidence;
}

const postGate1 = (repo, evidence, deps) =>
  callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...evidence, author: ARCHITECT }, deps);

/** A child process as `spawn` answers one, driven by the test; every call is kept (as `landing.test.mjs`'s). */
function aSpawn() {
  const calls = [];
  const children = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = 9000 + calls.length;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.kill = () => true;
    children.push(child);
    return child;
  };
  /** The newest child prints `stdout` and exits with `code`. */
  const exit = (code, stdout = '') => {
    const child = children.at(-1);
    if (stdout) child.stdout.emit('data', stdout);
    child.emit('close', code, null);
  };
  return { spawn, calls, exit };
}

test('a gate1 post spawns one pilot pr', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const fake = aSpawn();
  const evidence = gate1Evidence(repo);
  postGate1(repo, evidence, { spawn: fake.spawn, env: { PILOT_DECK_PORT: '4999', PILOT_DECK_DIR: repo } });
  assert.equal(fake.calls.length, 1, 'one pilot pr started');
  const [{ command, args, options }] = fake.calls;
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [PILOT_BIN, 'pr', '--ticket', evidence.ticket]);
  assert.equal(options.cwd, repo);
  assert.equal(options.shell, false);
  // The verb reads this deck's record, a scratch deck's included (L2).
  assert.equal(options.env.PILOT_DECK_PORT, '4999');
  assert.equal(options.env.PILOT_DECK_DIR, repo);
  fake.exit(0, 'feature PR #7 unchanged\n');
});

test('three statuses during a write coalesce', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  const deps = { spawn: fake.spawn, env: {} };
  for (let i = 0; i < 3; i += 1) startPrWrite(ticket, repo, deps);
  assert.equal(fake.calls.length, 1, 'one in flight');
  fake.exit(0, 'feature PR #7 updated\n');
  assert.equal(fake.calls.length, 2, 'the one queued rerun starts once the first exits');
  fake.exit(0, 'feature PR #7 unchanged\n');
  assert.equal(fake.calls.length, 2, 'nothing more was queued');
});

test('a status for a ticket with no gate1 spawns nothing', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const fake = aSpawn();
  const run = registerRun({ repo, pid: 4242 });
  const { ticket } = withTicket({}, repo);
  callTool('deck_status', { run: run.id, slug: 'x', ticket, slices: [] }, { spawn: fake.spawn, env: {} });
  assert.equal(fake.calls.length, 0, 'no gate1, no write');

  // With a gate1, PILOT_DECK_NO_LAND stops both triggers.
  const evidence = gate1Evidence(repo);
  const off = { spawn: fake.spawn, env: { PILOT_DECK_NO_LAND: '1' } };
  postGate1(repo, evidence, off);
  callTool('deck_status', { run: run.id, slug: 'x', ticket: evidence.ticket, slices: [] }, off);
  assert.equal(fake.calls.length, 0, 'PILOT_DECK_NO_LAND spawns nothing either way');

  // And the same status without it writes: the trigger is the gate1, not the switch.
  callTool('deck_status', { run: run.id, slug: 'x', ticket: evidence.ticket, slices: [] }, { spawn: fake.spawn, env: {} });
  assert.equal(fake.calls.length, 1);
  fake.exit(0, 'feature PR #7 unchanged\n');
});

test('a failure notes one line', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  const deps = { spawn: fake.spawn, env: {} };
  startPrWrite(ticket, repo, deps);
  fake.exit(1, 'gh pr create: HTTP 502\n');
  startPrWrite(ticket, repo, deps);
  fake.exit(1, 'gh pr create: HTTP 502\n');
  assert.equal(fake.calls.length, 2, 'the next trigger retries');
  assert.deepEqual(deckLines(ticket), ['feature PR not updated: gh pr create: HTTP 502']);
  assert.equal(listItems().filter((item) => /^Blocked/.test(item.title ?? '')).length, 0, 'no Blocked item');
});

test('a child that cannot be watched is a failure, and the ticket is not left in flight', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  let spawned = 0;
  const spawn = () => ((spawned += 1), {});
  assert.doesNotThrow(() => startPrWrite(ticket, repo, { spawn, env: {} }));
  startPrWrite(ticket, repo, { spawn, env: {} });
  assert.equal(spawned, 2, 'the second trigger spawns, not queues');
  assert.equal(deckLines(ticket).length, 1);
  assert.match(deckLines(ticket)[0], /^feature PR not updated: pilot pr could not start/);
});

test('a credential in the line is withheld', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  const token = `ghp_${'a1B2'.repeat(9)}`;
  startPrWrite(ticket, repo, { spawn: fake.spawn, env: {} });
  fake.exit(1, `gh pr edit: bad credentials ${token}\n`);
  const [line] = deckLines(ticket);
  assert.match(line, /^feature PR not updated: gh pr edit: /);
  assert.doesNotMatch(line, /ghp_/);
});

test('an opened PR is named on the ticket', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  startPrWrite(ticket, repo, { spawn: fake.spawn, env: {} });
  fake.exit(0, 'feature PR #12 opened\n');
  assert.deepEqual(deckLines(ticket), ['feature PR #12 opened']);
});
