/**
 * Pins for the rules following the reach (plain-session S2, L4): the repair hook puts in
 * `~/.claude/rules` exactly what the stored reach says and the rest in the rules root, and a
 * move down prunes only what the ledger says we shipped.
 *
 * Every home here is a scratch directory under a moved home directory (`lib/fake-home.mjs`),
 * because this writes into `~/.claude` unattended.
 */

// First, and before any module that can resolve a path from the home directory.
import { FAKE_HOME } from './lib/fake-home.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { installRules, repairRules } = await import('../install-rules.mjs');
const { filesUnder } = await import('../build-rules-ledger.mjs');
const { rulesRoot } = await import('../reach.mjs');

function scratchHome(t, level) {
  const home = fs.mkdtempSync(path.join(FAKE_HOME, 'reach-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  if (level) {
    fs.mkdirSync(path.join(home, '.claude', 'pilot'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'pilot', 'reach.json'), `${JSON.stringify({ level })}\n`);
  }
  return home;
}

const count = (dir) => (fs.existsSync(dir) ? filesUnder(dir).length : 0);
const homeRules = (home) => path.join(home, '.claude', 'rules');
const rootRules = (home) => path.join(rulesRoot({ home }), '.claude', 'rules');
const repair = (home) => repairRules({ home, stateDir: path.join(home, 'state') });

test('repair at nothing writes no rule home', (t) => {
  const home = scratchHome(t, 'nothing');
  repair(home);
  assert.equal(count(homeRules(home)), 0);
  assert.equal(count(rootRules(home)), 113);
});

test('rules puts the scoped set home and the always-on two in the root', (t) => {
  const home = scratchHome(t, 'rules');
  repair(home);
  assert.equal(count(homeRules(home)), 111);
  assert.deepEqual(filesUnder(rootRules(home)).sort(), ['orchestration.md', 'vertical-execution.md']);
});

test('moving down prunes only shipped copies', (t) => {
  const home = scratchHome(t);
  const target = homeRules(home);
  installRules({ target });
  fs.appendFileSync(path.join(target, 'orchestration.md'), '\nmine\n');
  fs.writeFileSync(path.join(target, 'my-own.md'), 'mine\n');

  const report = installRules({ target, only: 'none' });

  assert.equal(report.pruned.length, 112);
  assert.deepEqual(filesUnder(target).sort(), ['my-own.md', 'orchestration.md']);
  assert.ok(report.differing.some((item) => item.file === 'orchestration.md' && item.reason !== 'own'));
  assert.ok(report.notes.some((note) => note.includes('orchestration.md')));
  assert.equal(fs.readFileSync(path.join(target, 'my-own.md'), 'utf8'), 'mine\n');
});

test('a repair aimed at a target repairs it as today, whatever the home reach', (t) => {
  const reach = path.join(FAKE_HOME, '.claude', 'pilot', 'reach.json');
  fs.mkdirSync(path.dirname(reach), { recursive: true });
  fs.writeFileSync(reach, '{"level":"nothing"}\n');
  t.after(() => fs.rmSync(path.join(FAKE_HOME, '.claude'), { recursive: true, force: true }));
  const home = scratchHome(t);
  repairRules({ target: path.join(home, 'rules'), stateDir: path.join(home, 'state') });
  assert.equal(count(path.join(home, 'rules')), 113);
  assert.equal(fs.existsSync(rulesRoot({ home: FAKE_HOME })), false);
});

test('no reach file repairs as today', (t) => {
  const home = scratchHome(t);
  repair(home);
  assert.equal(count(homeRules(home)), 113);
  assert.equal(count(rootRules(home)), 0);
});
