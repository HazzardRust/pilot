// The audit offer (housekeeping-audit spec 3, 4; L13, A9; handoff-books spec 4-5, L2, L3): first use,
// then every twentieth counted hand-off.

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { OFFER_EVERY_HANDOFFS, auditDue, countHandoff, recordOffer, saveReport } from '../audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'D:/work/alpha';

const countHandoffs = (repo, n, prefix = 'itm_h') => {
  let count = 0;
  for (let i = 1; i <= n; i += 1) count = countHandoff(repo, `${prefix}${i}`);
  return count;
};

/** The record file of `repo`, made by an offer so the directory exists. */
const recordPath = (store, repo) => {
  recordOffer(repo, 'make-the-dir');
  const [dir] = fs.readdirSync(path.join(store, 'audits'));
  return path.join(store, 'audits', dir, 'record.json');
};

test('a repository with no offer and no report is due', (t) => {
  tempDeck(t);
  assert.equal(auditDue(REPO), 'first');
  assert.equal(auditDue('D:/work/beta'), 'first', 'every repository is its own record (A9)');
});

test('a fresh repository counts before its first due, and a record.json with no report is still first (P10)', (t) => {
  tempDeck(t);
  assert.equal(countHandoff(REPO, 'itm_h1'), 1);
  assert.equal(auditDue(REPO), 'first', "only record.json exists; hasReport's pattern does not match it");
});

test('twenty hand-offs make the audit due, nineteen do not', (t) => {
  tempDeck(t);
  recordOffer(REPO, 'slug');
  assert.equal(OFFER_EVERY_HANDOFFS, 20);
  assert.equal(countHandoffs(REPO, 19), 19);
  assert.equal(auditDue(REPO), null, 'nineteen counted hand-offs');
  assert.equal(countHandoff(REPO, 'itm_h20'), 20);
  assert.equal(auditDue(REPO), 'every', 'the twentieth');
  assert.equal(auditDue('D:/work/beta'), 'first', 'a hand-off in another repository counts nothing there');
});

test('the same hand-off counted twice counts once', (t) => {
  tempDeck(t);
  assert.equal(countHandoff(REPO, 'itm_same'), 1);
  assert.equal(countHandoff(REPO, 'itm_same'), 1, 'claimed twice');
  assert.equal(countHandoff(REPO, 'itm_other'), 2);
});

test('an offer re-arms the count', (t) => {
  tempDeck(t);
  countHandoffs(REPO, 3);
  const record = recordOffer(REPO, 'slug');
  assert.deepEqual(record.handoffs, [], 'an offer re-arms the count');
  assert.equal(record.offers.at(-1).run, 'slug');
  assert.equal(auditDue(REPO), null, 'offered: not due');
});

test('an old record of counted runs is read and not due', (t) => {
  const store = tempDeck(t);
  const file = recordPath(store, REPO);
  const runs = Array.from({ length: 10 }, (_, i) => `run-${i + 1}`);
  fs.writeFileSync(file, JSON.stringify({ offers: [{ run: 'old', at: '2026-10-01T00:00:00.000Z' }], counted: runs }));
  assert.equal(auditDue(REPO), null, 'ten old counted runs are not hand-offs');
  assert.equal(countHandoff(REPO, 'itm_h1'), 1, 'the old record reads as no hand-offs');
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file, 'utf8')), 'counted'), false, 'the next write drops counted (L3)');
});

test('a saved report resets the count', (t) => {
  tempDeck(t);
  countHandoffs(REPO, OFFER_EVERY_HANDOFFS);
  saveReport(REPO, {
    repo: REPO,
    scratch: 'D:/tmp/audit',
    startedAt: '2026-09-27T10:00:00.000Z',
    minutes: 1,
    tokens: null,
    unmeasured: ['measured spend: no usage log'],
    rows: [],
  });
  assert.equal(auditDue(REPO), null, 'an audit ran: neither first nor every');
  assert.equal(countHandoff(REPO, 'itm_after'), 1);
});

test('an unreadable record is refused with its path, never parsed as a fresh repository', (t) => {
  const store = tempDeck(t);
  countHandoff(REPO, 'itm_one');
  const [dir] = fs.readdirSync(path.join(store, 'audits'));
  const file = path.join(store, 'audits', dir, 'record.json');
  for (const bad of ['{"offers": [', '"a string"']) {
    fs.writeFileSync(file, bad);
    assert.throws(() => auditDue(REPO), (err) => err.message.includes(file), bad);
  }
});

const cli = (cwd, store, ...args) =>
  spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'audit', ...args], {
    cwd,
    env: { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_NO_OPEN: '1' },
    encoding: 'utf8',
  });

const tempRepo = (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-offer-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
};

test('pilot audit due exits 0 then 1 across an offer, and 0 again on the twentieth hand-off', (t) => {
  const store = tempDeck(t);
  const repo = tempRepo(t);

  const first = cli(repo, store, 'due');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), 'due first');

  assert.equal(cli(repo, store, 'offered', 'slug').status, 0);
  const answered = cli(repo, store, 'due');
  assert.equal(answered.status, 1);
  assert.equal(answered.stdout.trim(), 'not due 0');

  countHandoffs(repo, 19);
  assert.equal(cli(repo, store, 'due').stdout.trim(), 'not due 19');
  countHandoff(repo, 'itm_h20');
  const twentieth = cli(repo, store, 'due');
  assert.equal(twentieth.status, 0);
  assert.equal(twentieth.stdout.trim(), 'due every 20');
  assert.deepEqual(fs.readdirSync(repo), [], 'nothing written in the repository');
});

test('audit count is gone', (t) => {
  const store = tempDeck(t);
  const repo = tempRepo(t);
  const result = cli(repo, store, 'count', 'slug');
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /^usage: pilot audit /);
  assert.equal(cli(repo, store, 'due').stdout.trim(), 'due first', 'nothing was counted');
});

test('pilot audit offered takes a run key, rejecting only an empty one (P15)', (t) => {
  const store = tempDeck(t);
  const repo = tempRepo(t);
  for (const args of [['offered', ''], ['offered', '  '], ['offered']]) {
    const result = cli(repo, store, ...args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
  }
  assert.equal(cli(repo, store, 'due').stdout.trim(), 'due first', 'a refused word records nothing');
});

const stepOne = () =>
  /### 1\. Problem and spec, with the user\n([\s\S]*?)\n### 2\./.exec(
    fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n'),
  )[1].replace(/\s+/g, ' ');

// pilot-branch S12 (spec 12): a sub-deck starts at step 4, so step 1 is the main deck's alone
// and offers the audit on `pilot audit due` alone.
test('step 1 offers the audit with no role in the condition', () => {
  // lint: step 1 never names a sub-deck or the main deck
  assert.doesNotMatch(stepOne(), /sub-deck|main deck/i, 'no role conditions the offer');
});
