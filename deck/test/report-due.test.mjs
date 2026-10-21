/**
 * Report due reaches the pilot and its findings append (gate2-frees-lane S4; spec 4, ADR 0148). The lander's
 * bodiless report on landed, filled by the deck (lander S15), carries one `report due` line, the deck's and never the user's, that wakes the pilot; the
 * pilot's `Findings:` reply goes into the report's body, and findings that ask are refused like any report.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPORT_DUE, closeLanded } from '../closing-report.mjs';
import { KIND_GATE2, SIGN_OFF } from '../items.mjs';
import { MAX_TEXT_BYTES } from '../store-core.mjs';
import { callTool } from '../server-tools.mjs';
import { addPilotMessage, addReply, listItems, postItem, registerRun, repliesSince, setSlices, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

/** A green ticket with a run record and a signed gate2 that has landed; the report the lander posts on it, bodiless. */
function aLandedReport(t) {
  tempDeck(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-report-due-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: process.pid });
  setSlices(run.id, [{ slice: 'x', state: 'in QA', branch: 'feat/x' }], undefined, { slug: 'x', ticket: evidence.ticket });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #591' });
  closeLanded(gate.id);
  callTool('deck_post', { kind: 'report', ticket: evidence.ticket, repo, author: 'pilot:pilot-lander' });
  return { gate, report: listItems().find((item) => item.kind === 'report' && item.ticket === evidence.ticket) };
}

const stored = (id) => listItems().find((item) => item.id === id);

test("the lander's report carries report due once", (t) => {
  const { gate, report } = aLandedReport(t);
  assert.ok(report, 'a report was posted');

  const lines = stored(report.id).replies.filter((reply) => reply.text === REPORT_DUE);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].from, 'deck', 'the deck wrote it, never the user');
  assert.ok(Number.isInteger(lines[0].seq), 'a seq, so it wakes the pilot');
  const handed = repliesSince(0).replies.filter((reply) => reply.itemId === report.id);
  assert.deepEqual(handed.map((reply) => [reply.from, reply.kind, reply.text]), [['deck', 'report', REPORT_DUE]], "the pilot's wait hands it over");

  assert.equal(closeLanded(gate.id), null);
  assert.equal(stored(report.id).replies.filter((reply) => reply.text === REPORT_DUE).length, 1, 'a second close adds no line');
});

test("the pilot's findings append", (t) => {
  const { report } = aLandedReport(t);
  const before = stored(report.id).body;

  addPilotMessage(report.id, 'Findings: the suite took 5 min.\nHuman steps: none.');
  assert.ok(stored(report.id).body.startsWith(before), 'the deck report is kept');
  assert.ok(stored(report.id).body.endsWith('Findings: the suite took 5 min.\nHuman steps: none.'));

  addPilotMessage(report.id, 'Findings: a second note.');
  assert.ok(stored(report.id).body.endsWith('Findings: the suite took 5 min.\nHuman steps: none.\n\nFindings: a second note.'));
});

test('findings that ask are refused', (t) => {
  const { report } = aLandedReport(t);
  const before = stored(report.id).body;

  assert.throws(
    () => addPilotMessage(report.id, 'Findings: all green.\nShould I delete the worktrees?'),
    { name: 'DeckRefusal', message: /asks nothing \(ADR 0148\).*Should I delete the worktrees\?$/ },
  );
  assert.equal(stored(report.id).body, before, 'nothing appended');
  assert.throws(() => addReply(report.id, 'Findings: from the user'), /takes no reply/, "the user's reply is still refused");
  assert.equal(stored(report.id).body, before);
});

test('findings past what the deck accepts are refused', (t) => {
  const { report } = aLandedReport(t);
  const before = stored(report.id).body;
  addPilotMessage(report.id, `Findings: ${'a'.repeat(MAX_TEXT_BYTES - 1000)}`);

  assert.throws(() => addPilotMessage(report.id, `Findings: ${'b'.repeat(2000)}`), { name: 'DeckRefusal', message: /longer than the deck accepts/ });
  assert.ok(stored(report.id).body.startsWith(before) && !stored(report.id).body.includes('bbb'), 'nothing appended');
});
