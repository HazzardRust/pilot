/**
 * archive-page S9: the deck's and the wrapper's own logs are rows, one per line (spec 3, 6, 8; A6, L5).
 *
 * Every test takes its own store directory. The wrapper.log lines are written by the wrapper's own `log`, with the
 * home directory pointed at the test's store, so the fixture is the producer's format and not a copy of it.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';

import { tempDeck } from '../testUtils.mjs';

const { archiveRows } = await import('../archive.mjs');
const { default: textlogs, LOG_TAIL } = await import('../archive-kinds/textlogs.mjs');

const require = createRequire(import.meta.url);
const { log } = require('../../hooks/lib/wrapper-log.js');

/** `run` with the home directory at `home`, so the wrapper's `log` writes `<home>/.claude/pilot/wrapper.log`. */
function withHome(home, run) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const rowsOf = (dir) => textlogs.rowsOf({ dir, deck: { items: [] }, months: [] });

test('each line is a row with its time', (t) => {
  const dir = tempDeck(t);
  const home = fs.mkdtempSync(path.join(dir, 'home-'));
  withHome(home, () => ['session start: lane free', 'handoff: posted', 'handoff: claimed'].forEach((line) => log(line)));
  const written = fs.readFileSync(path.join(home, '.claude', 'pilot', 'wrapper.log'), 'utf8');
  fs.writeFileSync(path.join(dir, 'wrapper.log'), written);
  const stamps = written.trimEnd().split('\n').map((line) => line.slice(0, line.indexOf(' ')));

  const rows = rowsOf(dir);

  assert.equal(textlogs.kind, 'log');
  assert.deepEqual(rows.map((row) => row.id), ['wrapper.log:1', 'wrapper.log:2', 'wrapper.log:3']);
  assert.deepEqual(rows.map((row) => row.at), stamps);
  assert.equal(rows[1].fields.find((field) => field.label === 'File').value, 'wrapper.log');
  assert.match(rows[1].fields.find((field) => field.label === 'Line').value, /handoff: posted$/);
});

test('a line without a stamp takes the file time, and a long line is clipped in its title', (t) => {
  const dir = tempDeck(t);
  const file = path.join(dir, 'deck.log');
  fs.writeFileSync(file, `[deck] listening\r\n${'word '.repeat(60).trimEnd()}\n${'x'.repeat(5000)}\n`);
  const mtime = new Date('2026-03-04T05:06:07.000Z');
  fs.utimesSync(file, mtime, mtime);

  const rows = rowsOf(dir);

  assert.deepEqual(rows.map((row) => row.at), Array(3).fill(mtime.toISOString()));
  assert.equal(rows[0].title, '[deck] listening', 'no carriage return is left on a CRLF line');
  assert.equal(rows[1].title, 'word '.repeat(24).trimEnd(), 'clipped to 120 at a word');
  assert.equal(rows[1].fields.find((field) => field.label === 'Line').value.length, 299);
  assert.equal(rows[2].title, 'deck.log:3', 'a first word past 120 is never cut into');
  assert.ok(!rows[2].fields.find((field) => field.label === 'Line').value.includes('xxx'), 'a 5,000-character word is no row');
});

test('no log file is no rows', (t) => {
  const dir = tempDeck(t);
  assert.deepEqual(rowsOf(dir), []);
});

test('only the newest 2,000 lines', (t) => {
  const dir = tempDeck(t);
  const lines = Array.from({ length: 2500 }, (_, n) => `[deck] line ${n + 1} ${'é'.repeat(n % 7)}`);
  fs.writeFileSync(path.join(dir, 'deck.log'), `${lines.join('\n')}\n`);

  const rows = rowsOf(dir);

  assert.equal(LOG_TAIL, 2000);
  assert.equal(rows.length, 2000);
  assert.equal(rows[0].id, 'deck.log:501');
  assert.equal(rows.at(-1).id, 'deck.log:2500');
  assert.equal(rows.at(-1).title, lines.at(-1), 'the last line is included, multi-byte text intact');
});

test('a token in a log line is withheld', (t) => {
  const dir = tempDeck(t);
  const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
  fs.writeFileSync(path.join(dir, 'deck.log'), `[deck] 401 GET /api/view: Authorization: Bearer ${token}\n`);

  const rows = archiveRows().filter((row) => row.kind === 'log');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '<withheld: credential>');
  assert.equal(rows[0].fields.find((field) => field.label === 'Line').value, '<withheld: credential>');
  assert.ok(!JSON.stringify(rows).includes(token), 'no string of any row holds the token');
});

test('a title cut never leaves part of a token', (t) => {
  const dir = tempDeck(t);
  const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
  fs.writeFileSync(path.join(dir, 'deck.log'), `${'pad '.repeat(26)}Bearer ${token}\n`);

  const [row] = archiveRows().filter((each) => each.kind === 'log');

  assert.equal(row.fields.find((field) => field.label === 'Line').value, '<withheld: credential>');
  assert.ok(!row.title.includes(token.slice(0, 6)), `the title ${row.title} holds no head of the token`);
});

test('the raw test logs stay unread', (t) => {
  const dir = tempDeck(t);
  fs.writeFileSync(path.join(dir, 'deck.log'), '[deck] listening\n');
  fs.mkdirSync(path.join(dir, 'logs'));
  fs.writeFileSync(path.join(dir, 'logs', 'x.log'), `token: ${'z'.repeat(32)}\n`);

  const seen = [];
  const spies = ['readFileSync', 'openSync', 'readdirSync', 'createReadStream', 'statSync'].map((name) => {
    const original = fs[name];
    return mock.method(fs, name, function spied(file, ...rest) {
      seen.push(String(file).replaceAll('\\', '/'));
      return original.call(this, file, ...rest);
    });
  });
  let rows;
  try {
    rows = archiveRows().filter((row) => row.kind === 'log');
  } finally {
    spies.forEach((spy) => spy.mock.restore());
  }

  assert.deepEqual(rows.map((row) => row.id), ['deck.log:1']);
  assert.ok(seen.some((file) => file.endsWith('/deck.log')), 'the spy saw the deck log read');
  assert.deepEqual(seen.filter((file) => /\/logs(\/|$)/.test(file)), [], 'nothing under logs/ was touched');
});
