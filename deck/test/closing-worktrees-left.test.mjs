/**
 * The closing report lists the worktrees left (lander-tail spec 5, A3, L7): its `Worktrees left:` section
 * names the run's worktrees still on disk when the report posts, read from git at post time, never land's
 * earlier `kept` lines. A git that cannot list makes the section `none recorded`, never a failed post.
 */

import './no-open.mjs';

import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { closeLanded, closingReportOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_REPORT, SIGN_OFF } from '../items.mjs';
import { callTool } from '../server-tools.mjs';
import { addReply, listItems, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SLUG = 'x';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The body's `Worktrees left:` section, up to the blank line that ends it. */
const leftOf = (body) => body.slice(body.indexOf('Worktrees left:')).split('\n\n')[0];

const record = { slug: SLUG, feature: SLUG, slices: [] };
const landedWith = (line) => ({ pr: '#590', landing: { state: 'landed', sha: '1a2b3c4', line } });

test('the report lists the worktree still on disk', () => {
  const { body } = closingReportOf(record, landedWith('landed feat/x on pilot at 1a2b3c4'), ['C:/w/pilot-x-qa']);
  assert.equal(leftOf(body), 'Worktrees left:\n- C:/w/pilot-x-qa');
});

test('no worktree left reads none', () => {
  const line = ['kept concluding C:/w/pilot-x', 'landed feat/x on pilot at 1a2b3c4'].join('\n');
  const { body } = closingReportOf(record, landedWith(line), []);
  assert.equal(leftOf(body), 'Worktrees left:\n- none', "land's kept lines are not read");
});

test('a git that cannot list reads none recorded, with the cause when it has one', () => {
  const { body } = closingReportOf(record, landedWith('landed feat/x on pilot at 1a2b3c4'), null);
  assert.equal(leftOf(body), 'Worktrees left:\n- none recorded');
  const why = closingReportOf(record, landedWith('landed feat/x on pilot at 1a2b3c4'), new Error('not a git repository\nsecond line')).body;
  assert.equal(leftOf(why), 'Worktrees left:\n- none recorded: not a git repository');
});

/** A repository with one run worktree (`qa/x`) and another run's beside it. */
function aRepo(t) {
  return gitFixture(t, 'closing-worktrees-left', (root) => {
    const repo = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', repo);
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'root');
    const qa = path.join(root, 'work-qa');
    git(repo, 'worktree', 'add', '-q', '-b', `qa/${SLUG}`, qa);
    git(repo, 'worktree', 'add', '-q', '-b', 'qa/other', path.join(root, 'work-other'));
    return { repo, qa };
  });
}

test('a posted report reads the disk', (t) => {
  tempDeck(t);
  const { repo, qa } = aRepo(t);
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: process.pid });
  setSlices(run.id, [{ slice: 'S1', state: 'merged', pr: 12 }], undefined, { slug: SLUG, ticket: evidence.ticket });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: 'kept concluding C:/w/gone\nlanded feat/x on pilot at 1a2b3c4' });
  closeLanded(gate.id);

  callTool('deck_post', { kind: KIND_REPORT, ticket: evidence.ticket, repo, author: 'pilot:pilot-lander' });

  const [report] = listItems().filter((item) => item.kind === KIND_REPORT && item.ticket === evidence.ticket);
  const [heading, ...paths] = leftOf(report.body).split('\n');
  assert.equal(heading, 'Worktrees left:');
  assert.deepEqual(paths.map((line) => path.resolve(line.replace(/^- /, ''))), [path.resolve(qa)], 'only the run worktree on disk');
});
