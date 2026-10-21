/**
 * S7 of pilot-develop-line: `pilot land` guards the chain and retargets (spec 4b, 4c; A6).
 * A run whose record says `base: feat/<N>` is refused before anything is pushed while N has not
 * landed (`chainGuard`, over S6's `baseOf`), and N's landing moves every open PR based on
 * `feat/<N>` to pilot (`retarget`), so N+1's PR shows only its own diff. `gh` is always faked.
 */

import { repos, passing, fakeGh, merges, mainSays, git } from './lib/land-repos.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { chainGuard, retarget } = await import('../land.mjs');

/** N's `feat/n` from pilot, and N+1's `feat/m` cut from it, its run record saying `base: feat/n`. */
function chain(t) {
  const { origin, clone, gitIn, n } = repos(t, 'n');
  const m = clone('m', 'origin/feat/n');
  const file = path.join(m, 'docs', 'design', 'm', 'run.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ slug: 'm', branch: 'feat/m', base: 'feat/n' }, null, 2)}\n`);
  return { origin, gitIn, n, m };
}

const edits = (calls) => calls.filter((args) => args[0] === 'pr' && args[1] === 'edit');

test('N+1 before N is refused', (t) => {
  const { origin, gitIn, m } = chain(t);
  const pilotBefore = git(origin, 'rev-parse', 'pilot');
  const featBefore = git(origin, 'rev-parse', 'feat/m');
  const { gh, calls } = fakeGh();

  assert.throws(() => chainGuard({ cwd: m }), /built on feat\/n, which has not landed/);
  const { code, out } = mainSays([], { cwd: m, git: gitIn(m), gh, test: passing, wait: 0 });

  assert.equal(code, 1);
  assert.match(out, /^NOT landed: built on feat\/n, which has not landed; land it first, or revert it \(fix round\); nothing pushed$/m);
  assert.equal(git(origin, 'rev-parse', 'pilot'), pilotBefore);
  assert.equal(git(origin, 'rev-parse', 'feat/m'), featBefore);
  assert.equal(calls.length, 0);
});

test('N+1 after N lands clean', (t) => {
  const { origin, gitIn, n, m } = chain(t);
  const { gh } = fakeGh([{ number: 12, headRefName: 'feat/m', baseRefName: 'feat/n', state: 'OPEN' }]);

  const first = mainSays([], { cwd: n, git: gitIn(n), gh, test: passing, wait: 0 });
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /^retargeted #12 to pilot$/m);

  // The guard reads pilot as last fetched; the landing's catch-up fetches first.
  git(m, 'fetch', '-q', 'origin');
  assert.doesNotThrow(() => chainGuard({ cwd: m }));
  const second = mainSays([], { cwd: m, git: gitIn(m), gh: fakeGh().gh, test: passing, wait: 0 });
  assert.equal(second.code, 0, second.out);
  assert.doesNotMatch(second.out, /conflict/i);

  const line = merges(origin, 'pilot');
  t.diagnostic(`git log --first-parent pilot:\n${line.join('\n')}`);
  assert.equal(line.filter((l) => l.startsWith('Merge feat/n into pilot ')).length, 1);
  assert.equal(line.filter((l) => l.startsWith('Merge feat/m into pilot ')).length, 1);
  assert.ok(line[0].startsWith('Merge feat/m into pilot '));
});

test("N's landing retargets N+1's PR", () => {
  const { gh, calls } = fakeGh([
    { number: 12, headRefName: 'feat/m', baseRefName: 'feat/n', state: 'OPEN' },
    // Closed, or based elsewhere: left alone.
    { number: 13, headRefName: 'feat/k', baseRefName: 'feat/n', state: 'CLOSED' },
    { number: 14, headRefName: 'feat/j', baseRefName: 'pilot', state: 'OPEN' },
  ]);

  const lines = retarget({ gh, head: 'feat/n' });

  assert.deepEqual(edits(calls), [['pr', 'edit', '12', '--base', 'pilot']]);
  assert.deepEqual(lines, ['retargeted #12 to pilot']);
});

test('a failed retarget is a line', (t) => {
  const throwing = () => {
    throw new Error('no GitHub host');
  };
  assert.deepEqual(retarget({ gh: throwing, head: 'feat/n' }), ['retarget failed: no GitHub host']);

  // The landing itself: gh refuses the edit, and the feature is landed all the same.
  const { gitIn, n } = repos(t, 'n');
  const { gh: listing } = fakeGh([{ number: 12, headRefName: 'feat/m', baseRefName: 'feat/n', state: 'OPEN' }]);
  const gh = (args) => (args[0] === 'pr' && args[1] === 'edit' ? throwing() : listing(args));

  const { code, out } = mainSays([], { cwd: n, git: gitIn(n), gh, test: passing, wait: 0 });

  assert.equal(code, 0, out);
  assert.match(out, /^retarget failed for #12: no GitHub host$/m);
  assert.match(out, /^landed feat\/n on pilot at /m);
});
