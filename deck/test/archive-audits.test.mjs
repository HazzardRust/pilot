/**
 * archive-page S8: audit reports, the audit record and the switch files as archive rows (spec 3, 6).
 *
 * Fixtures are written by the deck's own writers (`saveReport`, `recordOffer`, `setAlertSwitch`, `setUsageSwitch`,
 * `startArgs`), never typed by hand, so a change to a file's format reaches these tests.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { tempDeck } from '../testUtils.mjs';

const { archiveRows } = await import('../archive.mjs');
const { recordOffer, saveReport } = await import('../audit.mjs');
const { setAlertSwitch } = await import('../alert-switch.mjs');
const { setUsageSwitch } = await import('../usage-switch.mjs');
const { startArgs } = await import('../run-env.mjs');

const REPO = 'D:/work/alpha';

const aRow = (n) => ({
  area: 'loops',
  finding: `Finding ${n}`,
  command: 'timeout 900 npm test',
  output: '241 s, exit 0',
  exit: 0,
  fix: 'Add a test:changed script',
  saving: { minutes: 3, tokens: 0 },
  effort: 'M',
  spec: 'Problem: the suite is slow.',
});

const aReport = (count) => ({
  repo: REPO,
  scratch: 'D:/tmp/audit-20260927',
  startedAt: '2026-09-27T10:00:00.000Z',
  minutes: 42,
  tokens: 118000,
  duringRun: false,
  unmeasured: ['preview: no area file', 'measured spend: no usage log'],
  rows: Array.from({ length: count }, (_, i) => aRow(i + 1)),
});

const field = (row, label) => row.fields.find((f) => f.label === label)?.value;
const fieldValues = (row, label) => row.fields.filter((f) => f.label === label).map((f) => f.value);

test('an audit report reads as its top rows', (t) => {
  tempDeck(t);
  saveReport(REPO, aReport(7));

  const rows = archiveRows().filter((row) => row.kind === 'audit-file' && field(row, 'Rows') !== undefined);
  assert.equal(rows.length, 1);
  assert.equal(field(rows[0], 'Repo'), REPO);
  assert.equal(field(rows[0], 'Rows'), '7');
  assert.match(field(rows[0], 'Started'), /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  const top = fieldValues(rows[0], 'Top rows');
  assert.equal(top.length, 5);
  assert.match(top[0], / — M$/);
  assert.ok(top.every((line) => !line.includes('{')), 'no raw JSON in a field');
  assert.equal(rows[0].at, '2026-09-27T10:00:00.000Z');
});

test('the audit record is its own row', (t) => {
  tempDeck(t);
  saveReport(REPO, aReport(1));
  recordOffer(REPO, 'run-1');
  recordOffer(REPO, 'run-2');

  const rows = archiveRows().filter((row) => row.kind === 'audit-file' && field(row, 'Offers') !== undefined);
  assert.equal(rows.length, 1);
  assert.equal(field(rows[0], 'Offers'), '2');
  assert.equal(field(rows[0], 'Hand-offs'), '0');
  assert.equal(field(rows[0], 'Repo'), REPO);
});

test('a damaged audit file is no row and does not stop the rest', (t) => {
  const dir = tempDeck(t);
  saveReport(REPO, aReport(2));
  const folder = fs.readdirSync(path.join(dir, 'audits'))[0];
  fs.writeFileSync(path.join(dir, 'audits', folder, 'broken.json'), '{ not json');

  // The report, and the record saving it writes; the broken file adds nothing.
  const rows = archiveRows().filter((row) => row.kind === 'audit-file');
  assert.equal(rows.length, 2);
});

test('each switch file is one labelled row', (t) => {
  const dir = tempDeck(t);
  setAlertSwitch({ weekly: false });
  setUsageSwitch(false);
  startArgs({ level: 'rules' }, { settingsFile: path.join(dir, 'start-settings.json'), home: dir });

  const rows = archiveRows().filter((row) => row.kind === 'switch');
  assert.equal(rows.length, 3);
  const alerts = rows.find((row) => row.title === 'alerts.json');
  assert.equal(field(alerts, 'Weekly'), 'false');
  const usage = rows.find((row) => row.title === 'usage-log.json');
  assert.equal(field(usage, 'Enabled'), 'false');
  assert.ok(rows.every((row) => row.fields.every((f) => !f.value.startsWith('{'))), 'no raw JSON in a field');
});

test('a missing switch file is no row', (t) => {
  tempDeck(t);
  setAlertSwitch({ weekly: true });

  const rows = archiveRows().filter((row) => row.kind === 'switch');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'alerts.json');
});
