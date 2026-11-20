#!/usr/bin/env node
/**
 * Slice S1 of crew-handoff-trace: one trace row per hand-off step (spec 1, 7, 8).
 *
 * Every test takes a home of its own, so the real ~/.claude/pilot/handoff-trace.jsonl
 * is never written. `step` asks `os.homedir()` on each call, so redirecting the
 * environment is enough.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { step, traceFile } = require('../lib/wrapper-log.js');

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-trace-step-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_DIR: process.env.PILOT_DECK_DIR };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.PILOT_DECK_DIR;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

function rowsIn(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(function (line) { return JSON.parse(line); });
}

test('a posted crew-handoff leaves one row', function (t) {
  const home = scratchHome(t);
  step({ step: 'posted', kind: 'crew-handoff', item: 'itm_7df7fdd3e4a3' });
  const file = traceFile(home);
  assert.strictEqual(file, path.join(home, '.claude', 'pilot', 'handoff-trace.jsonl'));
  const rows = rowsIn(file);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'item', 'kind', 'step']);
  assert.strictEqual(rows[0].step, 'posted');
  assert.strictEqual(rows[0].kind, 'crew-handoff');
  assert.strictEqual(rows[0].item, 'itm_7df7fdd3e4a3');
  assert.ok(!Number.isNaN(Date.parse(rows[0].at)), 'at is a timestamp');
});

test('a row never carries free text', function (t) {
  const home = scratchHome(t);
  const marker = 'MARKER-7f3a-secret-body';
  step({ step: 'posted', kind: 'crew-handoff', item: 'itm_1', ticket: 'itm_2', body: marker, title: marker, prompt: marker });
  const text = fs.readFileSync(traceFile(home), 'utf8');
  assert.ok(!text.includes(marker), 'no body, title or prompt in the file');
  assert.deepStrictEqual(Object.keys(JSON.parse(text)).sort(), ['at', 'item', 'kind', 'step', 'ticket']);
});

test('a field that is not a string is dropped, and a bad row never throws', function (t) {
  const home = scratchHome(t);
  step({ step: 'posted', kind: 'crew-handoff', item: { body: 'nested' }, agent: 42 });
  assert.doesNotThrow(function () { step(null); });
  assert.doesNotThrow(function () { step(undefined); });
  const rows = rowsIn(traceFile(home));
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'kind', 'step']);
  assert.strictEqual(rows.length, 1, 'a row with no step is not written');
});

test('a scratch deck traces into its own directory', function (t) {
  const home = scratchHome(t);
  const deckDir = path.join(home, 'scratch-deck');
  process.env.PILOT_DECK_DIR = deckDir;
  step({ step: 'posted', kind: 'handoff', item: 'itm_3' });
  assert.strictEqual(rowsIn(path.join(deckDir, 'handoff-trace.jsonl')).length, 1);
  assert.ok(!fs.existsSync(traceFile(home)), 'nothing under the home store');
});

test('the file rotates at 512 KB', function (t) {
  const home = scratchHome(t);
  const file = traceFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(512 * 1024));
  step({ step: 'stopped', kind: 'crew-handoff', agent: 'a4a0177a' });
  assert.strictEqual(fs.statSync(file + '.old').size, 512 * 1024);
  const rows = rowsIn(file);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].step, 'stopped');
});
