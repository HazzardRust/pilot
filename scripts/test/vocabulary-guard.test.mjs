// co-pilot-tickets S7 (spec 1, 2, 7; L5, L8, L13, A7, A10): the guard half of the vocabulary script.
// `npm test` refuses a retired word anywhere in the whole repository, outside the closed list of §7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { retiredHits, SCOPE } from '../vocabulary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'vocabulary.mjs');
// The retired words, spelt in halves so this file stays clean under the guard it pins.
const OLD_AGENT = ['fore', 'man'].join('');
const OLD_KIND = ['KIND_', 'TA' + 'SK'].join('');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('a retired word fails the guard', () => {
  assert.deepEqual(retiredHits(`one\nSpawn the ${OLD_AGENT} first.\n`, 'agents/pilot.md'), [{ line: 2, word: OLD_AGENT }]);
  assert.deepEqual(retiredHits(`if (item.kind === ${OLD_KIND}) {}\n`, 'deck/items.mjs'), [{ line: 1, word: OLD_KIND }]);
  assert.equal(retiredHits(String.raw`/\b${'ta' + 'sk'}\b/`, 'deck/items.mjs').length, 1, "a regex's \\b is not a letter");
});

test("Claude Code's and the toolbox's words pass", () => {
  const notice = ['<', 'task-notification', '>'].join('');
  assert.deepEqual(retiredHits(`tools: TaskCreate, TaskUpdate, TaskOutput\n${notice}\n`, 'agents/pilot.md'), []);
  assert.deepEqual(retiredHits(read('agents/go-reviewer.md').split('\n')[19], 'agents/go-reviewer.md'), []);
  const dotnet = ['public async ', '<int> Load() => await ', '.FromResult(1);'].join('Ta' + 'sk');
  assert.deepEqual(retiredHits(dotnet, 'rules/csharp/patterns.md'), []);
  assert.equal(retiredHits(dotnet, 'rules/typescript/patterns.md').length, 2);
  assert.deepEqual(retiredHits('use `async`/`await` for multitasking', 'rules/arkts/coding-style.md'), []);
});

test("every run's own record is exempt, and nothing else in a design directory", () => {
  const said = `the ${OLD_AGENT} said so`;
  for (const file of ['docs/design/mac-linux/run.json', 'docs/design/readme-graph-deck/run.json', 'docs/design/implementer-gate-steps/run.json']) assert.deepEqual(retiredHits(said, file), [], file);
  for (const file of ['docs/design/mac-linux/architecture.md', 'docs/design/mac-linux/slices/run.json', 'docs/design/mac-linux/x/run.json']) assert.equal(retiredHits(said, file).length, 1, file);
});

test('each exception and each retired pattern has a case', () => {
  const [t, T] = ['ta' + 'sk', 'Ta' + 'sk'];
  const hits = (text, file) => retiredHits(text, file).length;
  const names = [...['Create', 'Update', 'List', 'Get', 'Output', 'Stop'].map((n) => T + n), `the ${T} tool`, `${t}-notification`];
  for (const name of names) assert.deepEqual(retiredHits(`use ${name} here`, 'deck/items.mjs'), [], name);
  for (const word of [t + 'kill', t + 'list', 'queueMicro' + t, 'micro' + t]) assert.deepEqual(retiredHits(`run ${word} now`, 'deck/items.mjs'), [], word);
  for (const dir of ['rules/fsharp/', 'rules/swift/']) assert.deepEqual(retiredHits(`a ${T} runs`, dir + 'x.md'), [], dir);
  assert.equal(hits(`a ${T} runs`, 'rules/go/x.md'), 1);
  assert.deepEqual(retiredHits(`unless required by the ${t}`, 'agents/x.md'), []);
  assert.equal(hits(`unless required by the ${t}`, 'deck/x.mjs'), 1);
  assert.deepEqual(retiredHits(`wider than the ${t} needs`, 'agents/security-reviewer.md'), []);
  assert.equal(hits(`wider than the ${t} needs`, 'agents/other.md'), 1);
  for (const file of ['skills/iterative-retrieval/SKILL.md', 'deck/test/store-v3.test.mjs', 'deck/test/run-record-legacy.test.mjs']) assert.deepEqual(retiredHits(`the ${t} ran`, file), [], file);
  assert.deepEqual(retiredHits(`if (record.${t}) {}`, 'deck/runs.mjs'), []);
  assert.equal(hits(`if (record.${t}) {}`, 'deck/other.mjs'), 1);
  for (const sentence of [`it was un${t}ed`, `- **Un${t}ed**: a thread`,`the ${t.toUpperCase()}S list`, `a ${T}s list`, `${T}ed it`, `one ${t}s`, `the ${t} ran`]) assert.equal(hits(sentence, 'deck/items.mjs'), 1, sentence);
});

test('the migration may spell the old words', () => {
  for (const file of ['deck/store-core.mjs', 'deck/runs.mjs']) {
    const text = read(file);
    assert.deepEqual(retiredHits(text, file), [], file);
    assert.ok(retiredHits(text, 'deck/other.mjs').length > 0, `${file}'s text at another path`);
  }
});

test('the whole repository is clean', () => {
  assert.ok(SCOPE.includes('agents/pilot.md') && SCOPE.includes('scripts/vocabulary.mjs') && SCOPE.includes('scripts/test/vocabulary-guard.test.mjs'));
  assert.ok(SCOPE.some((file) => file.startsWith('docs/adr/')) && SCOPE.some((file) => file.startsWith('docs/design/')));
  const run = spawnSync(process.execPath, [SCRIPT, 'check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const none = spawnSync(process.execPath, [SCRIPT, 'check', 'no/such/path'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(none.status, 2, 'a path that names no tracked file is not a clean pass');
});

test("the user's words stay theirs", () => {
  const quotation = read('docs/adr/0152-' + OLD_AGENT + '-becomes-co-pilot-and-' + 'ta' + 'sks-become-tickets.md');
  assert.deepEqual(retiredHits(quotation, 'docs/adr/0152-x.md'), []);
  const said = `the ${OLD_AGENT} said so`;
  assert.deepEqual(retiredHits(said, 'docs/design/co-pilot-tickets/brief.md'), []);
  assert.deepEqual(retiredHits(said, 'docs/design/co-pilot-tickets-history/run.json'), [], "this run's own record");
  assert.deepEqual(retiredHits(said, 'docs/design/readme-graph-deck/run.json'), [], "the readme-graph-deck run's own record");
  assert.equal(retiredHits(said, 'docs/design/readme-graph-deck/architecture.md').length, 1, 'its design directory is not exempt');
  assert.deepEqual(retiredHits(said, 'docs/design/implementer-gate-steps/run.json'), [], "this run's own record");
  const row = `| 0152 | [the ${OLD_AGENT}](x.md) |`;
  assert.deepEqual(retiredHits(row, 'docs/adr/README.md'), [], 'the index row of ADR 0152');
  assert.equal(retiredHits(`| 0155 | [the ${OLD_AGENT}](x.md) |`, 'docs/adr/README.md').length, 1, 'any other row');
  assert.deepEqual(retiredHits(said, 'docs/adr/0001-other.md'), [{ line: 1, word: OLD_AGENT }]);
});

test("this run's design and ADR may quote the user", () => {
  const said = `the ${OLD_AGENT} said so`;
  for (const file of ['docs/design/blocked-yellow-yields/architecture.md', 'docs/design/blocked-yellow-yields/slices/S7.md', 'docs/adr/0153-a-blocked-yellow-ticket-yields-the-lane.md']) {
    assert.deepEqual(retiredHits(said, file), [], file);
  }
  assert.equal(retiredHits(said, 'docs/design/other/x.md').length, 1);
});

test("this run's design docs keep the user's words", () => {
  const said = `the ${OLD_AGENT} said so`;
  for (const file of ['docs/design/gate2-frees-lane/architecture.md', 'docs/design/gate2-frees-lane/slices/S9.md']) assert.deepEqual(retiredHits(said, file), [], file);
  assert.equal(retiredHits(said, 'docs/design/gate2-frees-lane-x/a.md').length, 1);
  assert.equal(retiredHits(said, 'docs/design/other/x.md').length, 1);
});

test("ADR 0154 keeps the user's words", () => {
  const said = `a ${['ta', 'sk'].join('')} ran`;
  assert.deepEqual(retiredHits(said, 'docs/adr/0154-x.md'), []);
  assert.equal(retiredHits(said, 'docs/adr/0155-x.md').length, 1);
  assert.equal(retiredHits(said, 'docs/adr/x.md').length, 1);
});

test('the 0153 index row is exempt', () => {
  assert.deepEqual(retiredHits(`| 0153 | [the ${OLD_AGENT}](x.md) |`, 'docs/adr/README.md'), []);
  assert.equal(retiredHits(`| 0154 | [the ${OLD_AGENT}](x.md) |`, 'docs/adr/README.md').length, 1);
});

test("this run's design and ADR may quote the user (architect-deeper)", () => {
  const said = `the ${OLD_AGENT} said so`;
  for (const file of ['docs/design/architect-deeper/architecture.md', 'docs/design/architect-deeper/slices/S4.md', 'docs/adr/0159-the-architect-works-deeper-not-wider.md']) {
    assert.deepEqual(retiredHits(said, file), [], file);
  }
  assert.equal(retiredHits(said, 'docs/design/other/x.md').length, 1);
});

test('the 0159 index row is exempt', () => {
  assert.deepEqual(retiredHits(`| 0159 | [the ${OLD_AGENT}](x.md) |`, 'docs/adr/README.md'), []);
  assert.equal(retiredHits(`| 0160 | [the ${OLD_AGENT}](x.md) |`, 'docs/adr/README.md').length, 1);
});

test('the rename half is gone', () => {
  const run = spawnSync(process.execPath, [SCRIPT, 'rename', 'x'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown command/);
});
