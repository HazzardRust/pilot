/**
 * Slice S4 of deck-workspace: the number where the user reads it (spec 10).
 *
 * S3 minted the number and proved it never moves; this is the half the user
 * sees. A tab reads `D1 pilot` — the number beside the label and never instead
 * of it, so the strip and the panels under it go on saying one name
 * (`deck/tabs.mjs`).
 *
 * The page is *given* the numbers rather than reading them: one store read per
 * page, made where the page is served, and a renderer that still opens no file.
 * That is why a page rendered without them draws no number at all, which is
 * also the shape of the case below.
 *
 * Numbering is lazy (A5), so a directory that has not registered since the
 * upgrade has no number yet. Its tab reads the label alone: `D?` on a tab would
 * be the deck naming something it does not know.
 *
 * Every test takes its own store directory. Nothing here may touch the real
 * store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { listDeckNumbers, listItems, listStoredRuns, registerRun, storeFile } =
  await import('../store.mjs');
const { repoKey } = await import('../runs.mjs');
const { tabsOf } = await import('../tabs.mjs');
const { renderHomePage } = await import('../ui/render.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');

/**
 * The same directory with its drive letter in the other case, which is a
 * spelling only Windows has and only Windows folds. Off Windows the path is
 * itself, so the case below asks the question the platform actually answers.
 */
const otherCase = (dir) =>
  process.platform === 'win32'
    ? dir.replace(/^[A-Za-z]:/, (drive) => (drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()))
    : dir;

/** The strip, and the words in each of its links — which is what a tab reads. */
const stripOf = (page) => page.split(/<nav class="runs-strip"[^>]*>/)[1].split('</nav>')[0];

const labelsIn = (page) =>
  [...stripOf(page).matchAll(/<a [^>]*>(.*?)<span class="count">/g)].map((link) => link[1]);

/** The overview, drawn the way the route draws it: the numbers read once, here. */
const overview = () => renderHomePage(listItems(), listStoredRuns(), null, false, listDeckNumbers());

/**
 * A deck written before S3: a run row a session is still holding, and no `decks`
 * map at all. This is the upgrade as it actually happens — the daemon restarts
 * with numbering in it and the session in that directory does not.
 */
const aDeckWithoutNumbers = (at = new Date().toISOString()) => ({
  version: 1,
  items: [
    {
      id: 'itm_0123456789ab',
      kind: 'question',
      title: 'Which port?',
      body: '4321?',
      repo: MINE,
      postedAt: at,
      replies: [],
    },
  ],
  runs: [
    { id: 'run_000000000001', repo: MINE, pid: process.pid, startedAt: at, lastSeenAt: at },
  ],
  seq: 4,
});

test('a tab reads its deck number in front of the name it already had', (t) => {
  tempDeck(t);

  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: THEIRS, pid: process.pid });

  assert.deepEqual(labelsIn(overview()), ['Overview', 'D1 pilot', 'D2 kettle']);
});

test('a deck that has not registered since S3 reads its label alone (A5)', (t) => {
  tempDeck(t);
  fs.writeFileSync(storeFile(), JSON.stringify(aDeckWithoutNumbers()), 'utf8');

  const page = overview();

  assert.deepEqual(labelsIn(page), ['Overview', 'pilot'], 'the label, and no placeholder in front of it');
  assert.doesNotMatch(stripOf(page), /D\d/, 'and no number belonging to anyone else');
});

test('a number the mint never hands out is no number at all', (t) => {
  tempDeck(t);
  // Numbering starts at D1 (S3), so 0 and -1 can only have been hand-edited in —
  // and `deck.json` is plain JSON a human is invited to look at. A tab draws the
  // label alone rather than `D0 pilot`, which would name a deck that is not there.
  registerRun({ repo: MINE, pid: process.pid });
  registerRun({ repo: THEIRS, pid: process.pid });
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.decks[repoKey(MINE)] = 0;
  deck.decks[repoKey(THEIRS)] = -1;
  fs.writeFileSync(storeFile(), JSON.stringify(deck), 'utf8');

  assert.deepEqual(labelsIn(overview()), ['Overview', 'pilot', 'kettle'], 'both tabs read their label alone');
  // Asked of the tab and not of the strip: the strip hides a `0` by truthiness
  // whatever `numberOf` answers, so a strip with no `D0` in it is evidence of
  // the renderer and not of the rule. `null` is the answer the rule owes.
  assert.deepEqual(
    tabsOf(listStoredRuns(), listItems(), listDeckNumbers()).map((tab) => tab.number),
    [null, null],
    'and neither hand-edited figure is a number either tab could draw',
  );
});

test('the number follows the directory, however the run row spells it', (t) => {
  tempDeck(t);
  // Three processes write this path and they agree on the characters, not
  // always on the separators or, on Windows, the case (`repoKey`). A tab looked
  // up by its raw `repo` would lose its number on a trailing slash.
  registerRun({ repo: MINE + path.sep, pid: process.pid });

  assert.deepEqual(labelsIn(overview()), ['Overview', 'D1 pilot']);

  // The case of the drive letter is the other spelling `repoKey` folds away,
  // and the one a second process is most likely to arrive with. A fold that
  // stopped folding would mint D2 here and leave the user with two decks where
  // there is one directory.
  registerRun({ repo: otherCase(MINE), pid: process.pid });

  assert.deepEqual(labelsIn(overview()), ['Overview', 'D1 pilot'], 'the drive letter in the other case is the same deck');
});

test('the deck the daemon serves carries the number on its tab', async (t) => {
  const origin = await deckOnAPort(t);
  registerRun({ repo: MINE, pid: process.pid });

  const page = await (await fetch(`${origin}/`)).text();

  assert.match(page, /D1 pilot/, 'the route reads the numbers and hands them to the page');
});
