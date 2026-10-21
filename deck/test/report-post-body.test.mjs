/**
 * A `report` posted with a ticket and no body is filled from that ticket's run record (one-integration-line
 * spec 8): the lander's closing report (`agents/pilot-lander.md`, clean tail step 2) is accepted whoever the
 * hook stamped as its author, its body `closingReportOf`'s. Any other kind with no body is still refused.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeLanded, closingReportOf } from '../closing-report.mjs';
import { KIND_GATE2, SIGN_OFF, isOpen } from '../items.mjs';
import { callTool } from '../server-tools.mjs';
import { TOOLS } from '../tools.mjs';
import { addReply, listItems, postItem, recordForTicket, registerRun, setSlices, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

/** A report body with its `Worktrees left:` section cut out: what is on disk is not what these tests are about. */
const withoutLeft = (body) => body.replace(/Worktrees left:\n(- .*\n)+\n/, '');

/** A ticket with a fixture run record and a signed gate2 that has landed. */
function aLanded(t) {
  tempDeck(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-report-body-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: process.pid });
  setSlices(run.id, [{ slice: 'S1', state: 'merged', pr: 12 }], undefined, { slug: 'x', ticket: evidence.ticket });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #901' });
  closeLanded(gate.id);
  return { repo, run, ticket: evidence.ticket, gate: listItems().find((item) => item.id === gate.id) };
}

for (const author of [undefined, 'pilot:pilot-lander', 'pilot-lander']) {
  test(`a report with no body is filled from the record (author ${author ?? 'unstamped'})`, (t) => {
    const { repo, ticket, gate } = aLanded(t);
    callTool('deck_post', { kind: 'report', ticket, repo, ...(author === undefined ? {} : { author }) });

    const reports = listItems().filter((item) => item.kind === 'report' && item.ticket === ticket);
    assert.equal(reports.length, 1, 'stored, no refusal');
    const { record } = recordForTicket(repo, ticket);
    // The fixture repository is no git repository, so the worktrees left are not compared (lander-tail spec 5).
    assert.equal(withoutLeft(reports[0].body), withoutLeft(closingReportOf(record, gate, []).body), "its body is the closing report");
    assert.match(reports[0].body, /Merge #901 into main/);
  });
}

test('the deck_post schema asks only for kind', () => {
  const { inputSchema } = TOOLS.find((tool) => tool.name === 'deck_post');
  assert.deepEqual(inputSchema.required, ['kind'], "{kind:'report', ticket} satisfies it, so the client sends it");
});

for (const body of ['', '  \n']) {
  test(`a report with an empty body is filled from the record (${JSON.stringify(body)})`, (t) => {
    const { repo, ticket, gate } = aLanded(t);
    callTool('deck_post', { kind: 'report', ticket, repo, body });

    const reports = listItems().filter((item) => item.kind === 'report' && item.ticket === ticket);
    assert.equal(reports.length, 1, 'stored, no refusal');
    const { record } = recordForTicket(repo, ticket);
    assert.equal(withoutLeft(reports[0].body), withoutLeft(closingReportOf(record, gate, []).body));
  });
}

test('a question with a blank body or no title is still refused', (t) => {
  const { repo, ticket } = aLanded(t);
  const question = { kind: 'question', ticket, repo, title: 'Q', options: ['a', 'b'], recommended: 'a' };
  assert.throws(() => callTool('deck_post', { ...question, body: '' }), { name: 'DeckRefusal', message: /body must be a non-empty string/ });
  const { title: _title, ...untitled } = question;
  assert.throws(() => callTool('deck_post', { ...untitled, body: 'Which?' }), {
    name: 'DeckRefusal',
    message: /title must be a non-empty string/,
  });
});

test("the lander's post then finished closes the record", (t) => {
  const { repo, ticket, run } = aLanded(t);
  callTool('deck_post', { kind: 'report', ticket, repo, body: '' });
  // slices is required by the schema and the store; [] lays nothing over the stored table.
  callTool('deck_status', { slug: 'x', slices: [], finished: 'closing report posted', run: run.id });

  assert.equal(recordForTicket(repo, ticket).record.finished, 'closing report posted');
  assert.equal(isOpen(listItems().find((item) => item.id === ticket)), false, 'the ticket is closed');
});

test('any other kind with no body is still refused', (t) => {
  const { repo, ticket } = aLanded(t);
  assert.throws(
    () => callTool('deck_post', { kind: 'question', ticket, repo, title: 'Q', options: ['a', 'b'], recommended: 'a' }),
    { name: 'DeckRefusal', message: /body must be a non-empty string/ },
  );
});
