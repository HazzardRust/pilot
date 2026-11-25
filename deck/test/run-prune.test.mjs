/**
 * The deck starts a run's mid-run prune (prune-worktrees spec 2, 4; A4): `deck_status` `finished: "planned"` or
 * `"abandoned…"` spawns `node <bin>/pilot.mjs worktrees prune --run <slug> --stage <stage>` in the run's
 * repository, no shell, hidden, and the child's lines become one note on the ticket. Every spawn is injected.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startRunPrune } from '../run-prune.mjs';
import { listItems, registerRun } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');
const deckLines = (id) => listItems().find((item) => item.id === id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/** A directory that is not a git repository. */
function plainRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'run-prune-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
}

/** A child process as `spawn` answers one, driven by the test; every call is kept. */
function aSpawn() {
  const calls = [];
  const children = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = 9100 + calls.length;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.kill = () => true;
    children.push(child);
    return child;
  };
  const exit = (code, stdout = '', stderr = '') => {
    const child = children.at(-1);
    if (stdout) child.stdout.emit('data', stdout);
    if (stderr) child.stderr.emit('data', stderr);
    child.emit('close', code, null);
  };
  return { spawn, calls, exit };
}

test('the deck starts it on finished', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const run = registerRun({ repo, pid: 4242 });
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  const deps = { spawn: fake.spawn, env: {} };

  callTool('deck_status', { run: run.id, slug: 'x', ticket, slices: [], finished: 'closing report posted' }, deps);
  assert.equal(fake.calls.length, 0, 'a landed run is the lander\'s prune');

  callTool('deck_status', { run: run.id, slug: 'x', ticket, slices: [], finished: 'planned' }, deps);
  assert.equal(fake.calls.length, 1, 'one prune started');
  const [{ command, args, options }] = fake.calls;
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [PILOT_BIN, 'worktrees', 'prune', '--run', 'x', '--stage', 'planned']);
  assert.equal(options.cwd, repo);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  fake.exit(0, 'no design tree of run x\n');

  callTool('deck_status', { run: run.id, slug: 'x', ticket, slices: [], finished: 'abandoned by the user' }, deps);
  assert.deepEqual(fake.calls.at(-1).args.slice(-2), ['--stage', 'abandoned']);
  fake.exit(0);
});

test('the deck notes the outcome', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  startRunPrune(ticket, repo, 'x', 'abandoned', { spawn: fake.spawn, env: {} });
  fake.exit(0, 'removed /w/s1 and branch slice/x-s1\nkept unpushed /w/s2\n');
  const notes = deckLines(ticket);
  assert.equal(notes.length, 1, 'one note');
  assert.match(notes[0], /kept unpushed \/w\/s2/);

  startRunPrune(ticket, repo, 'x', 'planned', { spawn: fake.spawn, env: {} });
  fake.exit(1, '', 'pilot worktrees: git worktree list failed; nothing removed\n');
  assert.match(deckLines(ticket).at(-1), /nothing removed/, 'a failure is noted too');
});

test('nothing from the request reaches argv but a slug and a stage', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const { ticket } = withTicket({}, repo);
  const fake = aSpawn();
  const deps = { spawn: fake.spawn, env: {} };
  startRunPrune(ticket, repo, '--force', 'planned', deps);
  startRunPrune(ticket, repo, 'x', 'landed', deps);
  startRunPrune(ticket, 'relative', 'x', 'planned', deps);
  startRunPrune('not-a-ticket', repo, 'x', 'planned', deps);
  startRunPrune(ticket, repo, 'x', 'planned', { spawn: fake.spawn, env: { PILOT_DECK_NO_LAND: '1' } });
  assert.equal(fake.calls.length, 0);
  assert.doesNotThrow(() => startRunPrune(ticket, repo, 'x', 'planned', { spawn: () => { throw new Error('ENOENT'); }, env: {} }));
  assert.match(deckLines(ticket).at(-1), /ENOENT/);
});
