/**
 * The classifier log as archive rows (archive-page S6, spec 3, 6, 8): one row per refusal read through
 * `readRefusals`, a credential in any field withheld by the archive seam, a torn line skipped, no log no rows.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { appendRefusal, LOG_FILENAME } = await import('../classifier-log.mjs');
const { archiveRows } = await import('../archive.mjs');
const { default: classifier } = await import('../archive-kinds/classifier.mjs');

const KEY = `sk-${'q'.repeat(40)}`;

const refusal = (over = {}) => ({
  repo: 'D:/work/alpha',
  ticket: 'itm_alpha',
  agent: 'pilot-implementer',
  reason: 'reaches a shared remote',
  tool: 'Bash',
  command: 'git push --force origin main',
  verdict: 'refused',
  ...over,
});

/** A line as `appendRefusal` writes it, but raw: no credential check on the way in. */
const rawLine = (over = {}) => JSON.stringify({ when: '2026-11-20T10:00:00.000Z', ...refusal(over) });

const rowsIn = (dir) => classifier.rowsOf({ dir, deck: { items: [] }, months: [] });
const field = (row, label) => row.fields.find((entry) => entry.label === label)?.value;

test('a refusal reads as its fields', (t) => {
  const dir = tempDeck(t);
  appendRefusal(refusal(), { dir, now: () => new Date('2026-11-20T10:00:00.000Z') });

  const rows = rowsIn(dir);

  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.kind, 'classifier');
  assert.equal(row.id, 'classifier:1');
  assert.equal(row.at, '2026-11-20T10:00:00.000Z');
  assert.equal(row.title, 'refused: Bash');
  assert.deepEqual(
    row.fields.map((entry) => entry.label),
    ['Verdict', 'Repo', 'Ticket', 'Agent', 'Tool', 'Command', 'Reason'],
  );
  assert.equal(field(row, 'Verdict'), 'refused');
  assert.equal(field(row, 'Tool'), 'Bash');
  assert.equal(field(row, 'Command'), 'git push --force origin main');
});

test('a token is withheld on the page', async (t) => {
  const base = await deckOnAPort(t);
  const dir = process.env.PILOT_DECK_DIR;
  fs.writeFileSync(path.join(dir, LOG_FILENAME), rawLine({ command: `curl -H "Authorization: ${KEY}" https://api.example` }) + '\n');

  const row = archiveRows(dir).find((entry) => entry.kind === 'classifier');
  assert.equal(field(row, 'Command'), '<withheld: credential>');

  const page = async (query) => (await fetch(`${base}/api/view?${query}`, { headers: bearer() })).text();
  const list = await page('screen=archive');
  const opened = await page(`screen=archive&id=${encodeURIComponent(row.id)}`);
  assert.ok(list.includes('refused: Bash'), 'the refusal is on the page');
  assert.ok(opened.includes('<withheld: credential>'), 'the opened row shows the command withheld');
  for (const json of [list, opened]) assert.ok(!json.includes(KEY.slice(0, 20)), 'the token is nowhere in the archive view');
});

test('a secret set inline under a prefixed name is withheld', (t) => {
  const dir = tempDeck(t);
  const commands = [
    `AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI${'K'.repeat(20)} aws s3 ls`,
    `NPM_TOKEN=${'abcdef0123'.repeat(2)} npm publish`,
    `export DB_PASSWORD=${'hunter2'.repeat(3)}`,
  ];
  fs.writeFileSync(path.join(dir, LOG_FILENAME), commands.map((command) => rawLine({ command })).join('\n') + '\n');

  const shown = archiveRows(dir).filter((row) => row.kind === 'classifier');

  assert.deepEqual(
    shown.map((row) => field(row, 'Command')),
    commands.map(() => '<withheld: credential>'),
  );
});

test('a torn line is skipped, not fatal', (t) => {
  const dir = tempDeck(t);
  const torn = rawLine({ tool: 'Write' }).slice(0, 40);
  fs.writeFileSync(path.join(dir, LOG_FILENAME), [rawLine(), torn, rawLine({ verdict: 'no-verdict', tool: 'Edit' })].join('\n') + '\n');

  const rows = rowsIn(dir);

  assert.deepEqual(
    rows.map((row) => row.title),
    ['refused: Bash', 'no-verdict: Edit'],
  );
});

test('no log is no rows', (t) => {
  const dir = tempDeck(t);
  assert.equal(fs.existsSync(path.join(dir, LOG_FILENAME)), false);

  assert.deepEqual(rowsIn(dir), []);
});
