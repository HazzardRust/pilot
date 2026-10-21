// The audit offer (housekeeping-audit spec 3, 4; L13, L15, A9): first use, then every tenth counted run.

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { OFFER_EVERY_RUNS, auditDue, countRun, recordOffer, saveReport } from '../audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'D:/work/alpha';

const countRuns = (repo, n, prefix = 'run') => {
  let count = 0;
  for (let i = 1; i <= n; i += 1) count = countRun(repo, `${prefix}-${i}`);
  return count;
};

test('a repository with no offer and no report is due', (t) => {
  tempDeck(t);
  assert.equal(auditDue(REPO), 'first');
  assert.equal(auditDue('D:/work/beta'), 'first', 'every repository is its own record (A9)');
});

test('a fresh repository counts before its first due, and a record.json with no report is still first (P10)', (t) => {
  tempDeck(t);
  assert.equal(countRun(REPO, 'run-1'), 1, 'step 1 counts before checking due');
  assert.equal(auditDue(REPO), 'first', "only record.json exists; hasReport's pattern does not match it");
});

test('recording an offer makes it not due until ten more runs are counted', (t) => {
  tempDeck(t);
  countRuns(REPO, 3, 'before');
  const record = recordOffer(REPO, 'before-3');
  assert.deepEqual(record.counted, [], 'an offer re-arms the count');
  assert.equal(record.offers.at(-1).run, 'before-3');
  assert.equal(auditDue(REPO), null, 'offered: not due');

  assert.equal(OFFER_EVERY_RUNS, 10);
  assert.equal(countRuns(REPO, 9), 9);
  assert.equal(auditDue(REPO), null, 'nine counted runs');
  assert.equal(countRun(REPO, 'run-10'), 10);
  assert.equal(auditDue(REPO), 'every', 'the tenth');
});

test('counting one run key twice counts it once', (t) => {
  tempDeck(t);
  assert.equal(countRun(REPO, 'feature'), 1);
  assert.equal(countRun(REPO, 'feature'), 1, 'step 1 run twice');
  assert.equal(countRun(REPO, 'feature#2'), 2, 'run 2 of a split feature is its own run');
});

test('a resume of the run just offered the audit does not count again (B2)', (t) => {
  tempDeck(t);
  assert.equal(countRun(REPO, 'run-a'), 1);
  recordOffer(REPO, 'run-a');
  assert.equal(countRun(REPO, 'run-a'), 0, 'the answered run resuming does not recount itself');
});

test('a saved report resets the count', (t) => {
  tempDeck(t);
  countRuns(REPO, OFFER_EVERY_RUNS);
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
  assert.equal(countRun(REPO, 'after'), 1);
});

test('an unreadable record is refused with its path, never parsed as a fresh repository', (t) => {
  const store = tempDeck(t);
  countRun(REPO, 'one');
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

test('pilot audit due exits 0 then 1 across an offer, and 0 again on the tenth count', (t) => {
  const store = tempDeck(t);
  const repo = tempRepo(t);

  assert.equal(cli(repo, store, 'count', 'slug').stdout.trim(), '1', "step 1's real order: count before the first due");
  const first = cli(repo, store, 'due');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), 'due first');

  assert.equal(cli(repo, store, 'offered', 'slug').status, 0);
  assert.equal(cli(repo, store, 'count', 'slug').stdout.trim(), '0', 'the offered run does not recount itself (B2)');
  const answered = cli(repo, store, 'due');
  assert.equal(answered.status, 1);
  assert.equal(answered.stdout.trim(), 'not due 0');

  for (let i = 1; i <= 9; i += 1) assert.equal(cli(repo, store, 'count', `slug-${i}`).stdout.trim(), String(i));
  assert.equal(cli(repo, store, 'count', 'slug-9').stdout.trim(), '9', 'a doubled count does not move');
  assert.equal(cli(repo, store, 'due').status, 1);
  assert.equal(cli(repo, store, 'count', 'slug-10').stdout.trim(), '10');
  const tenth = cli(repo, store, 'due');
  assert.equal(tenth.status, 0);
  assert.equal(tenth.stdout.trim(), 'due every 10');
  assert.deepEqual(fs.readdirSync(repo), [], 'nothing written in the repository');
});

test('pilot audit offered takes a run key like count, rejecting only an empty one (P15)', (t) => {
  const store = tempDeck(t);
  const repo = tempRepo(t);
  for (const args of [['offered', ''], ['offered', '  '], ['offered'], ['count', ''], ['count', '  '], ['count']]) {
    const result = cli(repo, store, ...args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
  }
  assert.equal(cli(repo, store, 'due').stdout.trim(), 'due first', 'a refused word records nothing');
});

const stepOne = () =>
  /### 1\. Problem and spec, with the user\n([\s\S]*?)\n### 2\./.exec(
    fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n'),
  )[1].replace(/\s+/g, ' ');

test('step 1 counts the run, then offers the audit beside the depth question when pilot audit due says so', () => {
  const step = stepOne();
  assert.match(
    step,
    /`pilot audit count <slug>` \(`<slug>#<n>`[^)]*\)[^.]*`pilot audit due` exits 0[^.]*beside the depth question a `question` offering the audit[^.]*`pilot audit offered <slug>`[^.]*on yes spawn `pilot:pilot-auditor` in the background[^.]*`\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/audit\/SKILL\.md`/,
  );
});


// pilot-branch S12 (spec 12): a sub-deck starts at step 4, so step 1 is the main deck's alone
// and offers the audit on `pilot audit due` alone.
test('step 1 offers the audit on pilot audit due alone, with no role in the condition', () => {
  const step = stepOne();
  assert.match(step, /when `pilot audit due` exits 0, post beside the depth question/);
  assert.doesNotMatch(step, /sub-deck|main deck/i, 'no role conditions the offer');
});
