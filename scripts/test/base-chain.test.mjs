/**
 * S5 of pilot-develop-line: `pilot base` names the concluding feature (spec 4; L5, A5). The deck's half,
 * `queueView(...).concluding`, runs on this test's own store; `base` runs against a scratch bare origin and a
 * clone of it with `concluding` injected, so nothing reaches GitHub or a live deck.
 */

import '../../deck/test/no-open.mjs';

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { aTicket, tempDeck } from '../../deck/testUtils.mjs';

const { listItems, takeTicket } = await import('../../deck/store.mjs');
const { queueView } = await import('../../deck/tickets.mjs');
const { base } = await import('../base.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('a green ticket is the concluding feature', (t) => {
  tempDeck(t);
  const green = aTicket('Concluding', 'green');
  aTicket('Planning', 'red');
  takeTicket(green.id);
  const records = [
    { slug: 'm', ticket: 'itm_000000000000', branch: 'feat/m' },
    { slug: 'n', ticket: green.id, branch: 'feat/n' },
  ];
  assert.deepEqual(queueView(listItems(), green.repo, records).concluding, { ticket: green.id, slug: 'n', branch: 'feat/n' });
});

test('a green ticket itself chained on a feature is not concluding', (t) => {
  tempDeck(t);
  const green = aTicket('Chained', 'green');
  aTicket('Planning', 'red');
  takeTicket(green.id);
  const records = [{ slug: 'n', ticket: green.id, branch: 'feat/n', base: 'feat/m' }];
  assert.equal(queueView(listItems(), green.repo, records).concluding, null);
});

test('no green ticket, no chain', (t) => {
  tempDeck(t);
  const red = aTicket('Planning', 'red');
  takeTicket(red.id);
  assert.equal(queueView(listItems(), red.repo, [{ slug: 'r', ticket: red.id, branch: 'feat/r' }]).concluding, null);
});

/** A bare origin with `main`, `pilot` and a pushed `feat/n`, and a clone of it. */
function scratchRepos(t) {
  return gitFixture(t, 'base-chain:scratchRepos', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
    git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
    git(work, 'remote', 'set-head', 'origin', 'main');
    git(work, 'checkout', '-q', '-b', 'feat/n', 'main');
    git(work, 'commit', '-q', '--allow-empty', '-m', 'feat/n');
    git(work, 'push', '-q', 'origin', 'feat/n');
    git(work, 'checkout', '-q', 'main');
    git(work, 'branch', '-q', '-D', 'feat/n');
    return { origin, work };
  });
}

async function printed(cwd, concluding) {
  const said = [];
  const warned = [];
  const code = await base({ cwd, say: (text) => said.push(text), warn: (text) => warned.push(text), concluding });
  return { code, out: said.join(''), err: warned.join('') };
}

test('base prints the chained line', async (t) => {
  const { origin, work } = scratchRepos(t);
  const { code, out } = await printed(work, async () => ({ ticket: 'itm_1', slug: 'n', branch: 'feat/n' }));
  assert.equal(code, 0);
  assert.equal(out, `base feat/n ${git(origin, 'rev-parse', '--short', 'feat/n')} (concluding itm_1)\n`);
});

test('a concluding branch origin lacks falls back', async (t) => {
  const { work } = scratchRepos(t);
  const gone = await printed(work, async () => ({ ticket: 'itm_1', slug: 'gone', branch: 'feat/gone' }));
  assert.equal(gone.out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')} (feat/gone not on origin)\n`);
  for (const feature of [{ ticket: 'itm_1', branch: '--upload-pack=x' }, { ticket: 'itm_1) (x', branch: 'feat/n' }]) {
    const { code, out } = await printed(work, async () => ({ slug: 'gone', ...feature }));
    assert.equal(code, 0);
    assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`, feature.ticket);
  }
  const none = await printed(work, async () => null);
  assert.equal(none.out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')}\n`);
});

test('an unreachable deck falls back and says so', async (t) => {
  const { work } = scratchRepos(t);
  const { code, out } = await printed(work, async () => {
    throw new Error('connect ECONNREFUSED');
  });
  assert.equal(code, 0);
  assert.equal(out, `base pilot ${git(work, 'rev-parse', '--short', 'origin/pilot')} (deck not reached)\n`);
});
