/**
 * runs-build-on-each-other S4, spec 10; L3, L7, A5.
 *
 * `pilot tickets --open` is what ticket-making reads before its proposal table: every open ticket of
 * this directory in any state, and every open run's PR with the files it changes, so a job
 * already held somewhere is found before it is proposed again. `gh` and `git` are fakes here:
 * nothing reaches GitHub, and every call is an argv array. Never port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { deckOnAPort, postStored, shapedTicketBody, takeLive } from '../testUtils.mjs';

const { postItem, resolveItem, storeFile } = await import('../store.mjs');
const { repoKey } = await import('../items.mjs');
const { tickets } = await import('../tickets.mjs');

const ALPHA = 'D:/work/alpha';
const BETA = 'D:/work/beta';

const ticket = (title, extra = {}) => postStored({ kind: 'ticket', title, body: shapedTicketBody(title), repo: ALPHA, sliceCount: 3, ...extra });

/** A fake `gh`: `alice` is signed in and PR #12 is open on `feat/a`. */
function fakeGh(calls) {
  return (args) => {
    calls.push(args);
    if (args[0] === 'api') return 'alice\n';
    if (args[0] === 'pr' && args[1] === 'list') {
      return JSON.stringify([{ number: 12, headRefName: 'feat/a', state: 'OPEN', isCrossRepository: false, author: { login: 'alice' }, body: '' }]);
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
}

/** A fake `git` whose default branch is main and whose feat/a changes two files. */
function fakeGit(calls) {
  return (args) => {
    calls.push(args);
    if (args[0] === 'fetch') return '';
    if (args[0] === 'symbolic-ref') return 'refs/remotes/origin/main\n';
    if (args[0] === 'diff') return 'deck/a.mjs\ndocs/a.md\n';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

async function printed(base, options) {
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const said = [];
  const code = await tickets({ cwd: ALPHA, say: (text) => said.push(text), ...options });
  return { code, text: said.join('') };
}

test('--open lists red, yellow and green tickets of this directory and no closed or foreign ticket', async (t) => {
  const base = await deckOnAPort(t);
  const red = ticket('red one');
  const yellow = ticket('yellow one', { state: 'yellow' });
  const green = ticket('green one', { state: 'green' });
  resolveItem(postItem({ kind: 'ticket', title: 'closed one', body: shapedTicketBody(), repo: ALPHA, sliceCount: 3 }).id, 'done', '');
  ticket('foreign one', { repo: BETA });

  const view = await (await fetch(`${base}/api/tickets?repo=${encodeURIComponent(ALPHA)}&open=1`)).json();
  assert.deepEqual(
    view.open.map(({ title, state }) => [title, state]).sort(),
    [['green one', 'green'], ['red one', 'red'], ['yellow one', 'yellow']],
  );
  assert.equal(view.open.find((item) => item.id === yellow.id).body, shapedTicketBody('yellow one'));

  const gh = [];
  const { code, text } = await printed(base, { open: true, gh: fakeGh(gh), git: fakeGit([]) });
  assert.equal(code, 0);
  for (const item of [red, yellow, green]) assert.ok(text.includes(`## ${item.id} — ${item.title} (${item.state ?? 'red'})\n\n${item.body}`), item.title);
  assert.doesNotMatch(text, /closed one|foreign one/);
  assert.match(text, /no open run/, 'no records: says so rather than printing nothing');
  assert.deepEqual(gh, [], 'no records: gh is never asked');
});

test("--open lists each open run's PR with the files it changes", async (t) => {
  const base = await deckOnAPort(t);
  const records = [
    { repo: repoKey(ALPHA), record: { slug: 'a', branch: 'feat/a', finished: null, updatedAt: '2026-10-04T09:00:00.000Z' } },
    { repo: repoKey(ALPHA), record: { slug: 'b', branch: 'feat/b', finished: null, updatedAt: '2026-10-04T10:00:00.000Z' } },
  ];
  fs.writeFileSync(storeFile(), JSON.stringify({ version: 1, items: [], runs: [], seq: 0, deckSeq: 0, decks: {}, records }));
  takeLive(ticket('live').id);

  const gh = [];
  const git = [];
  const { code, text } = await printed(base, { open: true, gh: fakeGh(gh), git: fakeGit(git) });
  assert.equal(code, 0);
  assert.ok(text.includes('## #12 feat/a\n\n- deck/a.mjs\n- docs/a.md'), text);
  assert.doesNotMatch(text, /feat\/b/, 'a record with no open PR is no open run');
  assert.ok(git.some((args) => JSON.stringify(args) === JSON.stringify(['diff', '--name-only', 'origin/main...origin/feat/a'])), 'the three-dot diff, as argv');
  assert.ok([...gh, ...git].every((args) => Array.isArray(args)));
});

test('--open is exit 1 naming the cause when gh cannot answer, after the tickets it could print', async (t) => {
  const base = await deckOnAPort(t);
  const records = [{ repo: repoKey(ALPHA), record: { slug: 'a', branch: 'feat/a', finished: null, updatedAt: '2026-10-04T09:00:00.000Z' } }];
  fs.writeFileSync(storeFile(), JSON.stringify({ version: 1, items: [], runs: [], seq: 0, deckSeq: 0, decks: {}, records }));
  const held = ticket('held');
  const errors = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => errors.push(String(chunk));
  t.after(() => { process.stderr.write = write; });

  const { code, text } = await printed(base, { open: true, gh: () => { throw new Error('gh: not logged in'); }, git: fakeGit([]) });
  process.stderr.write = write;
  assert.equal(code, 1);
  assert.ok(text.includes(held.id), 'the tickets are still printed');
  assert.doesNotMatch(text, /no open run/, 'never "no open run" when it could not tell');
  assert.match(errors.join(''), /open runs unknown: gh: not logged in/);
});

test('plain pilot tickets prints what it printed before', async (t) => {
  const base = await deckOnAPort(t);
  takeLive(ticket('the live one').id);
  ticket('parked', { state: 'yellow' });

  const before = fs.readFileSync(storeFile(), 'utf8');
  const plain = await (await fetch(`${base}/api/tickets?repo=${encodeURIComponent(ALPHA)}`)).json();
  assert.equal(plain.open, undefined, 'no open list without open=1');
  await fetch(`${base}/api/tickets?repo=${encodeURIComponent(ALPHA)}&open=1`);
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'neither read writes the store');
  const calls = [];
  const { code, text } = await printed(base, { gh: fakeGh(calls), git: fakeGit(calls) });
  assert.equal(code, 0);
  assert.doesNotMatch(text, /parked|\((red|yellow|green)\)|## #|no open run/);
  assert.match(text, /no other red ticket/);
  assert.deepEqual(calls, [], 'plain tickets asks neither gh nor git');
});

test('an open run is a feat/ record of this directory with an open PR of the signed-in account, one gh list for all', async () => {
  const { openRuns } = await import('../tickets.mjs');
  const pr = (number, branch, extra = {}) => ({ number, headRefName: branch, state: 'OPEN', isCrossRepository: false, author: { login: 'alice' }, ...extra });
  const record = (slug, extra = {}) => ({ slug, branch: `feat/${slug}`, finished: null, updatedAt: 't', ...extra });
  const calls = [];
  const prs = [
    pr(1, 'feat/a'),
    pr(2, 'feat/gone'),
    pr(3, 'feat/merged', { state: 'MERGED' }),
    pr(4, 'feat/theirs', { author: { login: 'mallory' } }),
    pr(5, 'feat/fork', { isCrossRepository: true }),
    pr(6, 'feat/elsewhere'),
  ];
  const gh = (args) => {
    calls.push(args);
    return args[0] === 'api' ? 'alice\n' : JSON.stringify(prs);
  };
  const records = ['a', 'merged', 'theirs', 'fork'].map((slug) => record(slug)).concat(record('gone', { finished: 'abandoned by the user' }));

  assert.deepEqual(openRuns(records, { gh }), [{ branch: 'feat/a', pr: 1, updatedAt: 't' }]);
  assert.equal(calls.filter((args) => args[1] === 'list').length, 1);
  assert.deepEqual(openRuns([{ slug: 'x', branch: 'docs/x' }], { gh: () => assert.fail('gh asked') }), [], 'no feat/ record, no gh');
});

test('pilot tickets accepts --open and nothing else', async () => {
  const { main } = await import('../tickets.mjs');
  assert.equal(await main(['--closed']), 2);
  assert.equal(await main(['--open', 'x']), 2);
});
