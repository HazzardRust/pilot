/**
 * The deck's report says merge the main PR (one-integration-line S3; spec 3, A1). A landing's last line is
 * S2's `mainLine`; the closing report's first human step names that PR, `pilot land` is spawned alone with no
 * `--ready` retry behind it, and an unknown main line is the pilot's to act on (the store's short flag).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closingReportOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_QUESTION, SIGN_OFF } from '../items.mjs';
import { startLanding } from '../landing.mjs';
import { addReply, listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { isShortLanding } from '../store-items.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const record = { feature: 'x', slug: 'x', slices: [] };
const reportFor = (line) => closingReportOf(record, { pr: '#590', landing: { state: 'landed', sha: '1a2b3c4', line } }, []).body;

test("the report's first step is the main PR", () => {
  const body = reportFor('landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #901');
  const steps = body.split('\n').filter((line) => line.startsWith('Human step:'));
  assert.equal(steps[0], 'Human step: Merge #901 into main with a merge commit, when you want main to have it.');
  assert.match(body, /^main gets pilot: #901$/m, 'the main line is shown');
  assert.doesNotMatch(body, /merge first|ready/i, 'no merge-first or ready step');

  assert.ok(reportFor('landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #901 (opened)').includes('Human step: Merge #901 into main'));
  assert.match(reportFor('landed feat/x on pilot at 1a2b3c4'), /^main gets pilot: not printed by land$/m);
  assert.doesNotMatch(reportFor('landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #9x'), /Merge #9/, 'no looser match than mainLine');
});

/** A repository and a linked worktree of it, removed when the test ends. */
function aCheckout(t) {
  const dir = (name) => {
    const made = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-closing-main-${name}-`));
    t.after(() => fs.rmSync(made, { recursive: true, force: true }));
    return made;
  };
  const repo = dir('repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = dir('wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, worktree };
}

test('no ready retry is spawned', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const evidence = withTicket({ pr: '#576', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: 4242 });
  setSlices(run.id, [], undefined, { slug: 'x', ticket: evidence.ticket, worktree });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);

  const spawned = [];
  const timers = [];
  const clock = { setTimeout: (run, ms) => (timers.push({ run, ms }), {}), clearTimeout() {} };
  const spawn = (command, args) => {
    const child = Object.assign(new EventEmitter(), { pid: 9001, args });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    spawned.push(child);
    return child;
  };
  startLanding(gate.id, { spawn, env: {}, clock });
  const [land] = spawned;
  // An older land's refused ready press, too: the deck retries it no more.
  land.stdout.emit('data', 'landed feat/x on pilot at 1a2b3c4\npr ready failed: HTTP 502\nmain gets pilot: unknown (gh failed)\n');
  land.emit('close', 0, null);
  // Whatever the clock holds past the landing's own timeout, fired: a retry would spawn here.
  for (const timer of timers.slice(1)) timer.run();
  spawned.slice(1).forEach((child) => child.emit('close', 0, null));

  assert.equal(spawned.length, 1, '`pilot land` once');
  assert.deepEqual(spawned[0].args.slice(1), ['land']);
  assert.ok(spawned.every((child) => !child.args.includes('--ready')), 'nothing with --ready');
  assert.ok(listItems().find((item) => item.id === gate.id).resolution, 'the gate2 is resolved');
  assert.deepEqual(listItems().filter((item) => item.kind === KIND_QUESTION && item.ticket === evidence.ticket), [], 'no Mark ready question');
});

test('an unknown main line asks the pilot', () => {
  const line = 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: unknown (gh failed)';
  assert.match(reportFor(line), /^main gets pilot: unknown \(gh failed\)$/m, 'the report shows it');
  assert.equal(isShortLanding({ ok: true, line }), true, 'the pilot is woken');
  assert.equal(isShortLanding({ ok: true, line: 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #901' }), false);
  assert.equal(isShortLanding({ ok: true, line: 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: open a PR from fork/pilot to main by hand' }), false);
  const none = 'feat/x already on pilot at 1a2b3c4\nmain gets pilot: no open PR';
  assert.equal(isShortLanding({ ok: true, line: none }), false, 'a re-landing with no main PR wakes nobody');
  assert.match(reportFor(none), /^main gets pilot: no open PR$/m, 'the report shows it');
  assert.equal(isShortLanding({ ok: true, line: 'landed feat/x on pilot at 1a2b3c4\npr ready failed: HTTP 502' }), false, 'the old ready line wakes nobody');
  assert.equal(isShortLanding({ ok: true, line: 'landed feat/x on pilot at 1a2b3c4\nmerge first: unknown' }), false, 'nor the old merge-first line');
});
