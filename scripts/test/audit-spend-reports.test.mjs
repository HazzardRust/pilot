/**
 * S7 of usage-telemetry: the audit cites the closing reports (spec 12, ADR 0044). The deck
 * store is written by hand in a temp `PILOT_DECK_DIR`; nothing here reads `~/.claude/pilot/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoKey } from '../../deck/items.mjs';
import { flat, read, sectionOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-spend.mjs');

/** A throwaway git repository and an empty deck directory beside it. */
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-reports-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'Alpha');
  fs.mkdirSync(repo);
  const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const deck = path.join(dir, 'deck');
  fs.mkdirSync(deck);
  return { dir, repo, deck };
}

const friction = (agent) => ({ agent, what: `${agent} waited on the suite`, evidence: 'npm test: 241s' });
const report = (rows) => ({
  featurePr: { number: 180, state: 'merged', mergeSha: 'a1b2c3d' },
  slices: [],
  assumed: [],
  friction: rows,
  humanSteps: [],
  worktreesLeft: [],
});

/** A store of these records, as `upsertRecord` keeps them: `{ repo, record }`, oldest first. */
function store(deck, entries) {
  const records = entries.map(([repo, record]) => ({ repo: repoKey(repo), record: { updatedAt: '2026-09-28T10:00:00.000Z', ...record } }));
  const body = { version: 1, items: [], runs: [], seq: 0, deckSeq: 0, decks: {}, records };
  fs.writeFileSync(path.join(deck, 'deck.json'), `${JSON.stringify(body)}\n`);
}

const run = ({ repo, dir, deck }) => {
  const result = spawnSync(process.execPath, [SCRIPT, repo, '--log', path.join(dir, 'no-log.jsonl')], {
    encoding: 'utf8',
    env: { ...process.env, PILOT_DECK_DIR: deck },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("reports carries each finished run's friction rows", (t) => {
  const s = scratch(t);
  store(s.deck, [
    [s.repo, { slug: 'first', finished: 'closing report posted', report: report([friction('pilot-implementer')]) }],
    [path.join(s.dir, 'Other'), { slug: 'theirs', finished: 'closing report posted', report: report([friction('pilot-qa')]) }],
    [s.repo, { slug: 'live', report: report([friction('pilot-architect')]) }],
    [s.repo, { slug: 'second', finished: 'closing report posted', report: report([friction('pilot-qa'), friction('pilot')]) }],
  ]);

  const out = run(s);
  assert.deepEqual(out.reports, [
    { slug: 'first', friction: [friction('pilot-implementer')] },
    { slug: 'second', friction: [friction('pilot-qa'), friction('pilot')] },
  ], 'finished runs of this repository only, oldest first');
  assert.equal(out.noReport, 0);
});

test('a finished record without report is counted, not an error', (t) => {
  const s = scratch(t);
  store(s.deck, [
    [s.repo, { slug: 'before-reports', finished: 'closing report posted' }],
    [s.repo, { slug: 'second', finished: 'closing report posted', report: report([friction('pilot')]) }],
  ]);

  const out = run(s);
  assert.deepEqual(out.reports, [{ slug: 'second', friction: [friction('pilot')] }]);
  assert.equal(out.noReport, 1);
});

test('a malformed report is skipped and counted', (t) => {
  const s = scratch(t);
  store(s.deck, [
    [s.repo, { slug: 'not-an-object', finished: 'done', report: 'friction: slow' }],
    [s.repo, { slug: 'no-list', finished: 'done', report: { friction: 'slow' } }],
    [s.repo, { slug: 'bad-row', finished: 'done', report: report([{ agent: 'pilot', what: 3, evidence: 'x' }]) }],
    [s.repo, { slug: 'good', finished: 'done', report: report([]) }],
  ]);

  const out = run(s);
  assert.deepEqual(out.reports, [{ slug: 'good', friction: [] }]);
  assert.equal(out.noReport, 3);
});

test('with no store file the script returns reports: [] and exits 0', (t) => {
  const s = scratch(t);
  const out = run(s);
  assert.deepEqual([out.reports, out.noReport], [[], 0]);
  assert.deepEqual(fs.readdirSync(s.deck), [], 'reading writes nothing');
});

/** The sentence of the auditor's Spend section that names `needle`, flattened to one line. */
const spendSentence = (needle) =>
  flat(sectionOf(read('agents/pilot-auditor.md'), 'Spend')).split(/(?<=\.) /).find((sentence) => sentence.includes(needle)) ?? '';

test('the auditor cites friction from audit-spend', () => {
  const sentence = spendSentence('`reports`');
  assert.match(sentence, /friction/);
  assert.match(sentence, /reproduce[^.]*scratch worktree/, 'a cited row is reproduced there first');
  assert.match(sentence, /the script as `command`/);
});

test('the auditor copies runs into measured', () => {
  assert.match(spendSentence('`measured`'), /copy `\{ log, from, to, spend, runs \}`/);
});

test("a ranked report's agent rows are its friction (yellow-lane S11)", (t) => {
  const s = scratch(t);
  const drain = { kind: 'drain', what: 'an output read twice', size: 3 };
  store(s.deck, [[s.repo, { slug: 'ranked', finished: 'closing report posted', report: report({ agents: [friction('pilot-qa')], drains: [drain] }) }]]);

  const out = run(s);
  assert.deepEqual(out.reports, [{ slug: 'ranked', friction: [friction('pilot-qa')] }], "the pilot's own drains are not the repository's friction");
  assert.equal(out.noReport, 0);
});
