/**
 * ci-gate spec 4 (S5): a gate2 on a repository with CI configured at its sha carries `checks`, the line
 * `pilot checks <sha>` printed, green at that sha; one missing, at another sha or not green is refused naming why.
 * A sha with no workflow file posts without it. Each line is `checkLine`'s own, the producer QA copies from.
 * Real repositories, local git only; nothing reaches a host.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { checkLine } from '../../scripts/checks.mjs';
import { checksRefusal } from '../gate2-checks.mjs';
import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { DeckRefusal, listItems } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository whose first commit `bare` has no workflow file and whose second, `ci`, adds `.github/workflows/gate.yml`. */
function scratch(t) {
  return gitFixture(t, 'gate2-checks:scratch', (root) => {
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', work);
    const commit = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), text);
      git(work, 'add', file);
      git(work, 'commit', '-q', '-m', file);
      return git(work, 'rev-parse', 'HEAD');
    };
    return { work, bare: commit('a.txt', 'base\n'), ci: commit('.github/workflows/gate.yml', 'on: pull_request\n') };
  });
}

const green = (sha) => checkLine({ state: 'green', sha });

test('no line, no post: CI configured and no checks is refused naming the field', (t) => {
  const { work, ci } = scratch(t);
  assert.match(checksRefusal(work, ci, undefined), /^NOT posted: .*checks/);
  assert.match(checksRefusal(work, ci, '  '), /^NOT posted: .*checks/);
});

test('another sha, no post: a green line at another sha7 is refused naming both', (t) => {
  const { work, bare, ci } = scratch(t);
  const refusal = checksRefusal(work, ci, green(bare));
  assert.match(refusal, /^NOT posted: /);
  assert.ok(refusal.includes(bare.slice(0, 7)) && refusal.includes(ci.slice(0, 7)), refusal);
});

test('not green, no post: a red or pending line is refused naming its checks', (t) => {
  const { work, ci } = scratch(t);
  const red = checksRefusal(work, ci, checkLine({ state: 'red', sha: ci, failed: ['test (ubuntu)', 'lint'] }));
  assert.match(red, /^NOT posted: checks red at [0-9a-f]{7}: test \(ubuntu\), lint/);
  assert.match(checksRefusal(work, ci, checkLine({ state: 'pending', sha: ci, pending: ['build'] })), /^NOT posted: checks pending .*build/);
  assert.match(checksRefusal(work, ci, checkLine({ state: 'unread', sha: ci, why: 'HTTP 502' })), /^NOT posted: checks unread .*HTTP 502/);
  assert.match(checksRefusal(work, ci, checkLine({ state: 'none', sha: ci })), /^NOT posted: checks none/, 'none where CI is configured (A2)');
});

test('a line that is not one check line is refused, a newline or control character included', (t) => {
  const { work, ci } = scratch(t);
  // The last line holds a literal U+2028 LINE SEPARATOR between `a` and `b`.
  for (const line of ['green', `checks red at ${ci.slice(0, 7)}: ${'x'.repeat(600)}`, `${green(ci)}\nchecks green at ${ci.slice(0, 7)}`, `checks red at ${ci.slice(0, 7)}: a\u0007b`, `checks red at ${ci.slice(0, 7)}: a b`]) {
    assert.match(checksRefusal(work, ci, line), /^NOT posted: checks must be one line/, JSON.stringify(line));
  }
});

test('a sha git cannot read counts as CI configured, so no checks is refused', (t) => {
  const { work } = scratch(t);
  assert.match(checksRefusal(work, 'deadbeef'.repeat(5), undefined), /^NOT posted: CI is configured at deadbee, .*checks/);
});

test('a green line, at a full or short gate2 sha, or none with no host (A2), is accepted', (t) => {
  const { work, ci } = scratch(t);
  assert.equal(checksRefusal(work, ci, green(ci)), null);
  assert.equal(checksRefusal(work, ci.slice(0, 12), green(ci)), null, 'a short gate2 sha');
  assert.equal(checksRefusal(work, ci, checkLine({ state: 'none', sha: ci, why: 'no host' })), null, 'pilot.host none (A2)');
});

test('deck_post refuses a gate2 without checks and stores one with its green line', (t) => {
  tempDeck(t);
  const { work, ci } = scratch(t);
  const { id } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo: work, state: 'yellow' });
  takeLive(id);
  const post = (checks) => callTool('deck_post', { kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: work, pr: '#250', sha: ci, ticket: id, checks });
  assert.throws(() => post(undefined), (err) => err instanceof DeckRefusal && /checks/.test(err.message));
  assert.match(post(green(ci)).content[0].text, /^Posted itm_/);
  assert.equal(listItems().find((item) => item.kind === KIND_GATE2)?.checks, green(ci));
});

test('no CI, no field: a sha with no workflow file needs no checks', (t) => {
  const { work, bare } = scratch(t);
  assert.equal(checksRefusal(work, bare, undefined), null);
  assert.equal(checksRefusal(path.join(work, 'not-a-repo'), bare, undefined), null, 'a repo that is no checkout is not checked');
});
