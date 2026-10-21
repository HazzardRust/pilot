/**
 * S1 of walkthrough-taste: the deck refuses a QA walkthrough step that runs a command
 * (spec 2, 9; L2–L6). The fixtures are verbatim from the 2026-10-05 walkthroughs:
 * itm_6b2c364cb976 (a script) and itm_f4e7427b21b6 (a look). Every test takes its own
 * store; nothing touches 4321.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';
import { walkthroughShapeGaps } from '../walkthrough-shape.mjs';

const { DeckRefusal, listItems, postItem } = await import('../store.mjs');

// itm_6b2c364cb976, its [1] and [16] as deck_read numbers them (steps 2 and 17 on the page).
const SETUP_STEP =
  "node C:/Users/Hazzard/qa-pb/scripts/real-setup.mjs C:/Users/Hazzard/qa-pb/walk → it prints 'base pilot <sha> (created from main)'";
const BUDGET_STEP =
  "cd C:/Users/Hazzard/qa-pb/real/kettle-subdeck; pilot budget --main 2 --sub 6; pilot budget → 'budget main 2 sub 6', then 'budget main 2 sub 6' and 'role sub budget 6'";

// itm_f4e7427b21b6, all seven steps.
const THE_LOOK = [
  'Open http://127.0.0.1:4440 and look at the tab strip → D1 KETTLE, with D2 KETTLE-SUBDECK drawn as its child (the corner mark) and both reading ended',
  'Click D2 → no chat and no thread list; the right rail holds RESUME, not PAUSE (I paused it after S2 integrated)',
  'Click D1 and open TICKETS → Kettle valve is yellow (planned), not live',
  'Click D2 and press RESUME → within about 30 s a pilot:pilot terminal window opens and the rail shows PAUSE, never PAUSING',
  'Open STATUS on D2 → S1 and S2 both integrated; nothing is redone',
  'Press PAUSE → it reads PAUSING; the window closes on its own once the step in hand ends, and the rail shows RESUME again',
  'Click D1 and open TICKETS → Kettle valve is yellow again, not live',
];

const forty = (step) => Array.from({ length: 40 }, (unused, index) => step(index + 1));

const aWalkthrough = (over = {}) => ({
  kind: 'walkthrough',
  title: 'kettle-handle: look at the sub-deck',
  body: "Built: the sub-deck; the checks are in the PR's QA comment.",
  url: 'http://127.0.0.1:4440',
  screens: THE_LOOK,
  ...over,
});

test('the 2026-10-05 command steps are refused by number', () => {
  const gaps = walkthroughShapeGaps(['Open http://127.0.0.1:4440 → the deck', SETUP_STEP, ...THE_LOOK, ...THE_LOOK, BUDGET_STEP]);
  assert.deepEqual(gaps, ['step 2 has a command: `node`', 'step 17 has a command: `cd`']);
  for (const gap of gaps) assert.doesNotMatch(gap, /qa-pb|kettle/, 'a gap names the step and word, never the step text');
});

test('the 2026-10-05 look passes whole', () => {
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK), []);
});

test('a code span naming a UI control is not a command', () => {
  assert.deepEqual(walkthroughShapeGaps(['Press `Sign off` → the gate closes', 'Open `S1` on STATUS']), []);
  assert.deepEqual(walkthroughShapeGaps(['run `npm test` → it is green']), ['step 1 has a command: `npm`']);
  assert.deepEqual(walkthroughShapeGaps(['`$env:PILOT_DECK_PORT=4440` → nothing printed']), ['step 1 has a command: `$env:`']);
});

test('the other command shapes are refused, in either half', () => {
  assert.deepEqual(
    walkthroughShapeGaps([
      'Open the deck → then type `./run.sh`',
      'git push → it lands',
      'Open the page && reload',
      'Open the deck with PILOT_DECK_PORT=4440 set',
      'Set the theme to dark → the page turns dark',
    ]),
    [
      'step 1 has a command: `./`',
      'step 2 has a command: `git`',
      'step 3 has a command: `&&`',
      'step 4 has a command: `PILOT_DECK_PORT=`',
    ],
  );
});

test('every L4 command word is refused leading an instruction or opening a code span', () => {
  for (const word of ['npm', 'npx', 'node', 'pilot', 'git', 'gh', 'curl', 'cd', 'set', 'export', 'bash', 'sh', 'pwsh', 'powershell', 'python', 'pip']) {
    const gap = [`step 1 has a command: \`${word}\``];
    assert.deepEqual(walkthroughShapeGaps([`${word} x → done`]), gap, `leading ${word}`);
    assert.deepEqual(walkthroughShapeGaps([`Type \`${word} x\` → done`]), gap, `span ${word}`);
  }
});

test('the L4 edges: $env: unquoted, pilot: a name, a result half, $ mid-span, a padded span', () => {
  assert.deepEqual(walkthroughShapeGaps(['Open the deck with $env:X=1 → it serves']), ['step 1 has a command: `$env:`']);
  assert.deepEqual(walkthroughShapeGaps(['pilot: the agent → its byline reads pilot']), []);
  assert.deepEqual(walkthroughShapeGaps(['Open the history → git log shows the commit']), [], 'only an instruction is held to its first word');
  assert.deepEqual(walkthroughShapeGaps(['Read `costs $5` on the card → it fits']), []);
  assert.deepEqual(walkthroughShapeGaps(['Type ` npm test` → green']), ['step 1 has a command: `npm`']);
});

test('forty command-free steps pass', () => {
  assert.deepEqual(walkthroughShapeGaps(forty((n) => `Click tab ${n} → it opens, and feels right`)), []);
});

test('postItem refuses a QA walkthrough that fails the shape, and stores nothing', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem(aWalkthrough({ author: 'pilot:pilot-qa', screens: [THE_LOOK[0], SETUP_STEP] })),
    (error) =>
      error instanceof DeckRefusal &&
      error.message === 'a QA walkthrough is a look, not a script; step 2 has a command: `node`',
  );
  assert.deepEqual(listItems(), []);
  assert.equal(postItem(aWalkthrough({ author: 'pilot:pilot-qa' })).screens.length, 7, 'the look itself is stored');
});

test('a credential-bearing env step is refused as a credential, never echoed', (t) => {
  tempDeck(t);
  const value = 'ghp_abcdefghijklmnopqrstuvwxyz0123';
  assert.throws(
    () => postItem(aWalkthrough({ author: 'pilot:pilot-qa', screens: [`GITHUB_TOKEN=${value} → signed in`] })),
    (error) =>
      error instanceof DeckRefusal && /looks like a GitHub token/.test(error.message) && !error.message.includes(value),
  );
  assert.deepEqual(listItems(), []);
});

test("the pilot's wizard walkthrough keeps commands and forty steps", (t) => {
  tempDeck(t);
  const wizard = forty((n) => (n === 1 ? 'gh auth login → it says Logged in' : `step ${n}`));
  assert.equal(postItem(aWalkthrough({ screens: wizard })).screens.length, 40);
  assert.equal(postItem(aWalkthrough({ author: 'pilot', screens: wizard })).screens.length, 40);
});

test('a QA walkthrough with no steps is stored: the body and Sign off alone (spec 3)', (t) => {
  tempDeck(t);
  assert.equal(postItem(aWalkthrough({ author: 'pilot:pilot-qa', screens: undefined })).screens, undefined);
});

// short-by-default S1 (spec 3, L3): the body is a look's preface; the checks table goes in the PR's QA comment.
const lines = (count) => Array.from({ length: count }, (unused, index) => `| check ${index + 1} | pass |`);
const BODY_GAP =
  "the body is 11 lines, at most 10; the checks table goes in the PR's QA comment; or say in one line why it needs more room, as longer";

test('a QA body of 11 non-blank lines is refused, naming the count and the QA comment', () => {
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK, lines(11).join('\n')), [BODY_GAP]);
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK, lines(11).join('\r')), [BODY_GAP], 'CR alone ends a line');
  assert.deepEqual(walkthroughShapeGaps([SETUP_STEP], lines(11).join('\n')), ['step 1 has a command: `node`', BODY_GAP]);
});

test('a QA body of 10 non-blank lines with blank lines between passes', () => {
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK, lines(10).join('\n\n  \n')), []);
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK, lines(10).join('\r\n\r\n')), [], 'CRLF blank lines are blank');
});

test('postItem refuses an 11-line QA walkthrough and stores nothing', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem(aWalkthrough({ author: 'pilot:pilot-qa', body: lines(11).join('\n') })),
    (error) => error instanceof DeckRefusal && error.message === BODY_GAP,
  );
  assert.deepEqual(listItems(), []);
});

test('postItem names a script when a step gap leads the body gap', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem(aWalkthrough({ author: 'pilot:pilot-qa', screens: [SETUP_STEP], body: lines(11).join('\n') })),
    (error) => error.message === `a QA walkthrough is a look, not a script; step 1 has a command: \`node\`; ${BODY_GAP}`,
  );
});

test("the pilot's wizard walkthrough keeps a long body", (t) => {
  tempDeck(t);
  assert.equal(postItem(aWalkthrough({ author: 'pilot', body: lines(40).join('\n') })).body.split('\n').length, 40);
});

// The backdoor (L3 overridden on itm_03d153719048): an outlier says in one line why it needs more room.
const WHY = 'twelve spec lines, each a row the user asked to see here';

test('longer lifts the body cap and nothing else', () => {
  assert.deepEqual(walkthroughShapeGaps(THE_LOOK, lines(11).join('\n'), WHY), []);
  assert.deepEqual(walkthroughShapeGaps([SETUP_STEP], lines(11).join('\n'), WHY), ['step 1 has a command: `node`']);
});

test('an 11-line QA body posted with longer is stored, carrying longer trimmed', (t) => {
  tempDeck(t);
  const item = postItem(aWalkthrough({ author: 'pilot:pilot-qa', body: lines(11).join('\n'), longer: `  ${WHY}  ` }));
  assert.equal(item.longer, WHY);
  assert.equal(item.body.split('\n').length, 11);
  assert.equal(listItems().length, 1);
});

test('a blank longer counts as absent: the 11-line body is refused, a short one stored without it', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem(aWalkthrough({ author: 'pilot:pilot-qa', body: lines(11).join('\n'), longer: ' \n ' })),
    (error) => error instanceof DeckRefusal && error.message === BODY_GAP,
  );
  assert.deepEqual(listItems(), []);
  assert.equal(Object.hasOwn(postItem(aWalkthrough({ author: 'pilot:pilot-qa', longer: '' })), 'longer'), false);
});

test("longer is a walkthrough's only; the pilot's wizard is unaffected", (t) => {
  tempDeck(t);
  assert.equal(postItem(aWalkthrough({ author: 'pilot', body: lines(40).join('\n'), longer: WHY })).longer, WHY);
  assert.throws(
    () => postItem({ kind: 'report', title: 'r', body: 'b', longer: WHY }),
    (error) => error instanceof DeckRefusal && /takes no longer/.test(error.message),
  );
});
