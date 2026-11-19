/**
 * crew-refusals S4, spec 6 (A4, A5, L9): the classifier log's writer and reader, each test
 * against a scratch `dir` of its own, never the user's store.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appendRefusal, readRefusals } from '../classifier-log.mjs';

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-classifier-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function entry(extra) {
  return {
    repo: 'C:/repo',
    ticket: null,
    agent: 'main',
    reason: 'outside the ticket',
    tool: 'Bash',
    command: 'gh pr ready 576',
    verdict: 'refused',
    ...extra,
  };
}

test('an entry reads back with its time, oldest first', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'first' }), { dir, now: () => new Date('2026-11-19T10:00:00Z') });
  appendRefusal(entry({ command: 'second', ticket: 'itm_t1' }), { dir, now: () => new Date('2026-11-19T10:01:00Z') });
  const read = readRefusals({ dir });
  assert.deepStrictEqual(read.map((r) => r.command), ['first', 'second']);
  assert.strictEqual(read[0].when, '2026-11-19T10:00:00.000Z');
  assert.deepStrictEqual(readRefusals({ dir, ticket: 'itm_t1' }).map((r) => r.command), ['second']);
  assert.deepStrictEqual(readRefusals({ dir, repo: 'C:/other' }), []);
});

test('a credential never reaches the log', (t) => {
  const dir = scratch(t);
  const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2';
  appendRefusal(entry({ command: 'git push https://x:' + token + '@github.com/o/r', reason: 'pushes with ' + token }), { dir });
  const [read] = readRefusals({ dir });
  assert.strictEqual(read.command, '<withheld: credential>');
  assert.strictEqual(read.reason, '<withheld: credential>');
  assert.ok(!fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').includes(token), 'not on disk either');
});

test('a command is clipped to 300 characters', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'x'.repeat(1000) }), { dir });
  assert.strictEqual(readRefusals({ dir })[0].command, 'x'.repeat(300));
});

test('the log stays bounded', (t) => {
  const dir = scratch(t);
  const small = { repo: '', agent: '', reason: '', tool: '', ticket: null, verdict: 'refused' };
  for (let n = 0; n <= 10000; n++) appendRefusal({ ...small, command: String(n) }, { dir });
  const read = readRefusals({ dir });
  assert.strictEqual(read.length, 10000);
  assert.strictEqual(read[0].command, '1', 'the oldest is gone');
  assert.strictEqual(read[9999].command, '10000');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'classifier.log'), 'utf8').split('\n').filter(Boolean).length, 10000);
});

test('a torn or foreign line is skipped', (t) => {
  const dir = scratch(t);
  appendRefusal(entry({ command: 'kept' }), { dir });
  fs.appendFileSync(path.join(dir, 'classifier.log'), '{"when":"2026\n{"hello":"world"}\n[1,2]\n');
  appendRefusal(entry({ command: 'kept too' }), { dir });
  assert.deepStrictEqual(readRefusals({ dir }).map((r) => r.command), ['kept', 'kept too']);
});

test('no log yet reads as none', (t) => {
  assert.deepStrictEqual(readRefusals({ dir: scratch(t) }), []);
});

test('an unwritable dir throws nothing', (t) => {
  const file = path.join(scratch(t), 'a-file');
  fs.writeFileSync(file, '');
  assert.doesNotThrow(() => appendRefusal(entry(), { dir: file }));
});
