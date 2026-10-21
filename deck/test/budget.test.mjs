/**
 * S15 of pilot-branch (spec 15; L18, L27, A12): the agent split is the user's setting. It is stored per
 * main deck, set by `pilot budget` from the terminal, and `GET /api/record` hands each session its own
 * number: the main deck's `main`, a sub-deck its parent's `yellow`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CEILING, DEFAULT_BUDGET, budget, checkBudget } from '../budget.mjs';
import { repoKey } from '../items.mjs';
import { registerRun, storeFile } from '../store.mjs';
import { deckOnAPort } from '../testUtils.mjs';
import { secretFile } from '../../hooks/lib/deck-secret.js';

const MAIN = path.resolve('D:/work/pilot');
const OTHER = path.resolve('D:/work/other');

const runs = () => registerRun({ repo: MAIN, pid: process.pid });
const budgetOf = async (base, repo) => (await (await fetch(`${base}/api/record?repo=${encodeURIComponent(repo)}`)).json()).budget;
const postBudget = (base, body, headers = {}) =>
  fetch(`${base}/api/budget`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** `pilot budget` run in `cwd` against the test's deck: its exit code and what it printed. */
async function cli(base, cwd, argv) {
  const out = [];
  const err = [];
  const code = await budget(argv, { cwd, url: base, say: (line) => out.push(line), complain: (line) => err.push(line) });
  return { code, out: out.join(''), err: err.join('') };
}

// --- deck-token S2: the guarded deck takes `pilot budget` (spec 2, 8) -----

// The guard as the daemon has it: no `secret` given, so the store's own file (deck-token L5).
const guardedDeck = (t) => deckOnAPort(t, { secret: undefined });

test('pilot budget is taken by a guarded deck', async (t) => {
  const base = await guardedDeck(t);
  runs();
  assert.deepEqual(await cli(base, MAIN, ['--main', '3']), { code: 0, out: 'budget main 3 yellow 8\n', err: '' });
});

test('a missing secret file is named, not guessed', async (t) => {
  const base = await guardedDeck(t);
  runs();
  fs.rmSync(secretFile());
  const { code, out, err } = await cli(base, MAIN, ['--main', '3']);
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.equal(err, `pilot budget: the deck has no secret at ${secretFile()}; start the deck with \`pilot deck\`\n`);
});

// --- yellow-agent S7: the split's second half is the yellow lane (spec 7) -----

test('pilot budget prints main and yellow', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  assert.deepEqual(await cli(base, MAIN, []), { code: 0, out: 'budget main 5 yellow 8\n', err: '' });
  assert.equal((await cli(base, MAIN, ['--sub', '4'])).err, 'pilot budget: usage: pilot budget [--main N] [--yellow N]\n', '--sub is gone');
});

test('a stored sub split reads as yellow', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.budgets = { [repoKey(MAIN)]: { main: 2, sub: 6 } };
  fs.writeFileSync(storeFile(), JSON.stringify(deck));
  assert.equal((await cli(base, MAIN, [])).out, 'budget main 2 yellow 6\n', 'read as yellow');
  await cli(base, MAIN, ['--main', '3']);
  assert.deepEqual(JSON.parse(fs.readFileSync(storeFile(), 'utf8')).budgets[repoKey(MAIN)], { main: 3, yellow: 6 }, 'written as yellow');
});

test('a deck with no setting reports 5 to the main deck', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  assert.equal(await budgetOf(base, MAIN), 5);
});

test("pilot budget --main 2 --yellow 6 changes what each role's record reports", async (t) => {
  const base = await deckOnAPort(t);
  runs();
  const set = await cli(base, MAIN, ['--main', '2', '--yellow', '6']);
  assert.equal(set.code, 0, set.err);
  assert.equal(set.out, 'budget main 2 yellow 6\n');
  assert.equal(await budgetOf(base, MAIN), 2, "the main deck's number");

  const one = await cli(base, MAIN, ['--yellow', '4']);
  assert.equal(one.out, 'budget main 2 yellow 4\n', 'one flag keeps the other field');
  assert.equal((await cli(base, MAIN, [])).out, 'budget main 2 yellow 4\n', 'no flags prints it');});

test('main 0, yellow 1 or a non-integer is refused, naming the field and its floor', async (t) => {
  const base = await deckOnAPort(t);
  for (const [body, field, floor] of [
    [{ main: 0 }, 'main', 1],
    [{ yellow: 1 }, 'yellow', 2],
    [{ main: 2.5 }, 'main', 1],
    [{ yellow: '6' }, 'yellow', 2],
    [{ main: 1e300 }, 'main', 1],
  ]) {
    const response = await postBudget(base, { repo: MAIN, ...body });
    assert.equal(response.status, 400, JSON.stringify(body));
    const { error } = await response.json();
    assert.match(error, new RegExp(`^${field} must be an integer of at least ${floor}`), JSON.stringify(body));
  }
  assert.equal(await budgetOf(base, MAIN), 5, 'nothing refused was stored');

  const typed = await cli(base, MAIN, ['--main', 'two']);
  assert.equal(typed.code, 2);
  assert.match(typed.err, /main must be an integer of at least 1/);
  assert.match((await cli(base, MAIN, ['--main', '--yellow', '4'])).err, /usage: pilot budget/, 'a flag with no value is the usage line');
  assert.equal((await cli(base, MAIN, ['--yellow', '1'])).code, 1, "the deck's refusal is exit 1");

  const page = await postBudget(base, { repo: MAIN, main: 2 }, { origin: base });
  assert.equal(page.status, 403, "a page, the deck's own included, cannot set it (A12)");
  assert.equal(await budgetOf(base, MAIN), 5);
});

test('a sum over thirteen is stored, with a warning naming the ceiling', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  const response = await postBudget(base, { repo: MAIN, main: 5, yellow: 9 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { budget: { main: 5, yellow: 9 }, warning: '14 is over the ceiling of 13' });
  assert.equal(await budgetOf(base, MAIN), 5, 'stored all the same');

  const shown = await cli(base, MAIN, []);
  assert.equal(shown.out, 'budget main 5 yellow 9\nwarning: 14 is over the ceiling of 13\n');
  assert.equal(shown.code, 0);
});

// --- lander S12: thirteen in flight, split five and eight (spec 10) -----

test('the ceiling warns past thirteen', () => {
  assert.equal(CEILING, 13);
  assert.deepEqual(checkBudget({ main: 5, yellow: 8 }), { budget: { main: 5, yellow: 8 } });
  assert.deepEqual(checkBudget({ main: 5, yellow: 9 }), { budget: { main: 5, yellow: 9 }, warning: '14 is over the ceiling of 13' });
});

test('a fresh deck splits five and eight', async (t) => {
  assert.deepEqual({ ...DEFAULT_BUDGET }, { main: 5, yellow: 8 });
  const base = await deckOnAPort(t);
  runs();
  assert.equal((await cli(base, MAIN, [])).out, 'budget main 5 yellow 8\n');
});

test('a stored split survives', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  await cli(base, MAIN, ['--main', '3', '--yellow', '5']);
  assert.equal((await cli(base, MAIN, [])).out, 'budget main 3 yellow 5\n', 'a stored 3/5 is kept, not moved to the new default');
});

test('pilot budget read in a directory with no session on the deck exits 1 with a line (A23)', async (t) => {
  const base = await deckOnAPort(t);
  runs();
  const shown = await cli(base, path.resolve('D:/work/nobody'), []);
  assert.equal(shown.code, 1);
  assert.match(shown.err, /^pilot budget: .*nobody has no session on this deck/);
  assert.equal(shown.out, '');
});

test("a setting on one main deck does not change another's", async (t) => {
  const base = await deckOnAPort(t);
  runs();
  await cli(base, MAIN, ['--main', '2', '--yellow', '6']);
  assert.equal(await budgetOf(base, OTHER), 5);
  // A read needs a session there (A23).
  registerRun({ repo: OTHER, pid: process.pid });
  assert.equal((await cli(base, OTHER, [])).out, 'budget main 5 yellow 8\n');
  assert.equal(await budgetOf(base, MAIN), 2);
});

test('the floors themselves are accepted, and a missing field is refused by name (FB F11)', () => {
  assert.deepEqual(checkBudget({ main: 1, yellow: 2 }), { budget: { main: 1, yellow: 2 } });
  assert.throws(() => checkBudget({ main: 3 }), { message: 'yellow must be an integer of at least 2, not undefined' });
  assert.throws(() => checkBudget({ yellow: 5 }), { message: 'main must be an integer of at least 1, not undefined' });
});
