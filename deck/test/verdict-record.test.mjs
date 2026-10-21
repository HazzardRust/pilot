/**
 * A gate1 must match the pilot's verdict record (architect-runs-red spec 4; L2, A1): the pilot
 * records its verdicts on the ticket with `deck_ticket verdicts`, and the deck refuses a gate1
 * whose artefact's Verdict lines at `sha` differ from that record, or that has an A‹n› and no
 * record, whoever posts it. Real temp repositories; nothing reaches GitHub.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { assertVerdicts } from '../lineage.mjs';
import { DeckRefusal, listItems, recordVerdicts } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';
const section6 = (...bullets) => `# X\n\n## 6. Assumed decisions\n\n${bullets.join('\n')}\n\n## 7. Out of scope\n`;
const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));
const ticketOf = (id) => listItems().find((item) => item.id === id);

/** A repository holding the artefact at one commit; returns its directory and that sha. */
function artefactAt(t, markdown) {
  const { work } = gitFixture(t, 'verdict-record:repo', (root) => {
    const dir = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', dir);
    return { work: dir };
  });
  fs.mkdirSync(path.join(work, path.dirname(ARTEFACT)), { recursive: true });
  fs.writeFileSync(path.join(work, ARTEFACT), markdown);
  git(work, 'add', ARTEFACT);
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'artefact');
  return { work, sha: git(work, 'rev-parse', 'HEAD') };
}

const TWO = section6('- **A1 One.** x', '  Verdict: stands', '- **A2 Two.** y', '  Verdict: stands — the default holds');
const BODY = 'A1 stands; A2 stands.';

test('the pilot records its verdicts', (t) => {
  const repo = tempDeck(t);
  const { ticket } = withTicket({}, repo);
  recordVerdicts(ticket, 'A1 Verdict: stands\nA2 Verdict: overturned: the user wants B\n');
  assert.deepEqual(ticketOf(ticket).verdicts, { A1: 'stands', A2: 'overturned: the user wants B' });
  const { ticket: yellow } = withTicket({}, repo, 'yellow');
  assert.throws(() => recordVerdicts(yellow, 'A1 Verdict: stands'), refused(yellow, 'red'));
  assert.equal(ticketOf(yellow).verdicts, undefined);
  assert.throws(() => recordVerdicts(ticket, 'A1 stands'), refused('A1 stands'));
});

test('only the pilot records', (t) => {
  const repo = tempDeck(t);
  const { ticket } = withTicket({}, repo);
  const args = { id: ticket, action: 'verdicts', verdicts: 'A1 Verdict: stands' };
  assert.throws(() => callTool('deck_ticket', { ...args, author: 'pilot:pilot-architect' }), refused('pilot', 'pilot:pilot-architect'));
  assert.equal(ticketOf(ticket).verdicts, undefined);
  assert.equal(callTool('deck_ticket', { ...args, author: 'pilot:pilot' }).content[0].text, `Recorded 1 verdicts on ${ticket}.`);
  assert.deepEqual(ticketOf(ticket).verdicts, { A1: 'stands' });
});

test('no record, no gate1', (t) => {
  const { work, sha } = artefactAt(t, TWO);
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: BODY }), refused('verdict record', 'deck_ticket verdicts'));
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: BODY }, { record: undefined }), refused('verdict record'));
});

test('a differing verdict is named', (t) => {
  const { work, sha } = artefactAt(t, TWO);
  const record = { A1: 'stands', A2: 'overturned: the user wants B' };
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: BODY }, { record }), (error) => refused('A2')(error) && !error.message.includes('A1'));
});

test('an id on one side is named', (t) => {
  const { work, sha } = artefactAt(t, TWO);
  const gate = { sha, artefact: ARTEFACT, body: BODY };
  assert.throws(() => assertVerdicts(work, gate, { record: { A1: 'stands' } }), refused('A2'));
  assert.throws(() => assertVerdicts(work, gate, { record: { A1: 'stands', A2: 'stands — the default holds', A3: 'stands' } }), refused('A3'));
  assert.doesNotThrow(() => assertVerdicts(work, gate, { record: { A1: 'stands', A2: 'stands — the default holds' } }));
});
