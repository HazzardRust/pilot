/**
 * The deck refuses a gate1 whose artefact, read at the gate's `sha`, holds an assumed decision
 * (A‹n›) with no verdict, or whose body leaves an A‹n› id out (verdict-pass spec 3, 5; L2-L6,
 * A2). Real temp repositories, a clone of a local bare origin; nothing reaches GitHub.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { assumedIds, unverdicted } from '../../scripts/verdicts.mjs';
import { KIND_GATE1 } from '../items.mjs';
import { assertVerdicts } from '../lineage.mjs';
import { DeckRefusal, listItems, postItem, recordVerdicts, resolveItem } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';

const section6 = (...bullets) => `# X\n\n## 5. Locked decisions\n\n- **L1 Y.** z\n\n## 6. Assumed decisions\n\n${bullets.join('\n')}\n\n## 7. Out of scope\n\n- **A9 Not here.** w\n`;

test('both bullet shapes are read', () => {
  assert.deepEqual(assumedIds(section6('- **A1** x', '- **A3 Title.** y')), ['A1', 'A3']);
  // Another list marker, or a heading without its period, is never a way past the check.
  assert.deepEqual(assumedIds(section6('* **A1** x', '1. **A2** y').replace('## 6.', '## 6')), ['A1', 'A2']);
});

test('a verdict line marks its own bullet only', () => {
  const md = section6('- **A1 One.** x', '  Verdict: stands ', '- **A3 Three.** y', '  more of A3', '- **A4** z', '  Verdict: stands - ASCII why');
  assert.deepEqual(unverdicted(md), ['A3']);
});

test('an overturn needs its why', () => {
  assert.deepEqual(unverdicted(section6('- **A1 One.** x', '  Verdict: overturned:')), ['A1']);
  assert.deepEqual(unverdicted(section6('- **A1 One.** x', '  Verdict: overturned: the user wants B')), []);
});

/** A clone whose `pilot` holds a base commit, checked out on `design/x` from pilot's tip. */
function scratch(t) {
  return gitFixture(t, 'gate1-verdicts:scratch', buildScratch);
}

function buildScratch(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  const commit = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    fs.writeFileSync(path.join(work, file), text);
    git(work, 'add', file);
    git(work, 'commit', '-q', '-m', file);
    return git(work, 'rev-parse', 'HEAD');
  };
  commit('a.txt', 'base\n');
  git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/pilot');
  return { work, commit };
}

/** Posts a gate1 for `design/x` at `sha` through `callTool`, its red ticket put first, with the pilot's `verdicts` recorded when given. */
function postGate1(repo, sha, body, verdicts) {
  const evidence = withTicket({ artefact: ARTEFACT, sha, locked: 1, slices: '| S1 |' }, repo);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo, ticket: evidence.ticket, author: 'pilot:pilot-architect' }).id, 'merged nothing', 'pilot:pilot-architect');
  if (verdicts !== undefined) recordVerdicts(evidence.ticket, verdicts);
  return callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body, repo, ...evidence, branch: 'design/x' });
}

const gate1s = () => listItems().filter((item) => item.kind === KIND_GATE1);
const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));

test('a long run of spaces after an overturn is judged in linear time', () => {
  const judge = (line) => {
    const t0 = performance.now();
    const out = unverdicted(section6('- **A1 One.** x', line));
    assert.ok(performance.now() - t0 < 100, 'linear in the line, not quadratic');
    return out;
  };
  assert.deepEqual(judge(`  Verdict: overturned:${' '.repeat(50000)}`), ['A1']);
  assert.deepEqual(judge(`  Verdict: overturned: x${' '.repeat(50000)}y`), []);
});

test('a gate1 with an unverdicted A1 is refused naming it', (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  const sha = commit(ARTEFACT, section6('- **A1 One.** x'));
  assert.throws(() => postGate1(work, sha, 'Assumed: A1.'), refused('A1', 'Verdict:'));
  assert.equal(gate1s().length, 0, 'no gate1 stored');
});

test('the same post passes once the verdict is committed', (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  commit(ARTEFACT, section6('- **A1 One.** x'));
  const sha = commit(ARTEFACT, section6('- **A1 One.** x', '  Verdict: stands — the default is the user\'s pick'));
  // A pilot-posted gate1 with no record is refused too (architect-runs-red A1).
  assert.throws(() => postGate1(work, sha, 'Assumed: A1 stands.'), refused('verdict record', 'A1'));
  const verdicts = 'A1 Verdict: stands — the default is the user\'s pick';
  assert.match(postGate1(work, sha, 'Assumed: A1 stands.', verdicts).content[0].text, /^Posted itm_/);
  assert.equal(gate1s().length, 1);
});

test("an architect's gate1 that differs from the record is refused through deck_post", (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  const sha = commit(ARTEFACT, section6('- **A1 One.** x', '  Verdict: overturned: B instead'));
  const evidence = withTicket({ artefact: ARTEFACT, sha, locked: 1, slices: '| S1 |' }, work);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo: work, ticket: evidence.ticket, author: 'pilot:pilot-architect' }).id, 'merged nothing', 'pilot:pilot-architect');
  recordVerdicts(evidence.ticket, 'A1 Verdict: stands');
  const post = (extra) => () => callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'A1 overturned.', repo: work, ...evidence, branch: 'design/x', author: 'pilot:pilot-architect', ...extra });
  assert.throws(post({}), refused('verdict record', 'A1'));
  // A padded sha, which the store trims and accepts, is checked as the store keeps it.
  assert.throws(post({ sha: `${sha} \n` }), refused('verdict record', 'A1'));
  assert.equal(gate1s().length, 0, 'no gate1 stored');
});

test('a body missing an id is refused', (t) => {
  const { work, commit } = scratch(t);
  const sha = commit(ARTEFACT, section6('- **A1 One.** x', '  Verdict: stands', '- **A2 Two.** y', '  Verdict: overturned: B instead'));
  const record = { record: { A1: 'stands', A2: 'overturned: B instead' } };
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: 'A1 stands. A20 is another run.' }, record), refused('A2', 'body'));
  assert.doesNotThrow(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: 'A1 stands; A2 overturned.' }, record));
});

test('an artefact absent at sha is refused', (t) => {
  const { work, commit } = scratch(t);
  const sha = commit('other.md', 'x\n');
  // The working file is not what the gate signs: present on disk, absent at `sha`.
  fs.mkdirSync(path.join(work, path.dirname(ARTEFACT)), { recursive: true });
  fs.writeFileSync(path.join(work, ARTEFACT), section6());
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: '' }), refused(ARTEFACT, sha));
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: '' }, { timeout: 0 }), refused(ARTEFACT, 'within 5 s'));
});

test("a gate1's repo config runs no command while the deck reads an absent sha", (t) => {
  const { work } = scratch(t);
  // A promisor remote would lazy-fetch the missing object through a command the repo names.
  git(work, 'config', 'core.repositoryformatversion', '1');
  git(work, 'config', 'extensions.partialClone', 'origin');
  git(work, 'config', 'remote.origin.promisor', 'true');
  git(work, 'config', 'remote.origin.uploadpack', 'touch PWNED; git-upload-pack');
  const sha = '0123456789abcdef0123456789abcdef01234567';
  assert.throws(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: '' }), refused(ARTEFACT, sha));
  assert.equal(fs.existsSync(path.join(work, 'PWNED')), false, 'no lazy fetch ran');
});

test('no A‹n› passes and a non-git repo is not checked', (t) => {
  const { work, commit } = scratch(t);
  const sha = commit(ARTEFACT, section6());
  assert.doesNotThrow(() => assertVerdicts(work, { sha, artefact: ARTEFACT, body: '' }));
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gate1-verdicts-plain-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.doesNotThrow(() => assertVerdicts(plain, { sha: '0305827', artefact: ARTEFACT, body: '' }));
});
