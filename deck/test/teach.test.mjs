/**
 * Slice S12: "Teach me" on a decision thread.
 *
 * The button is not a new mechanism and these tests are written to keep it from
 * becoming one. It is one more choice in the row a question already renders
 * (D22): the same `/reply` route, the same `choice` field, the same
 * `formnovalidate` that lets the empty box through — so what is worth asserting
 * is where it appears, where it must not, that it is distinguishable from the
 * answers beside it, and that the string it posts is the string the pilot's
 * hand-off rule reads. Everything else is the choices path S7 and S9 already
 * pinned.
 *
 * Pure, except the one test that clicks it: that the reply lands as `Teach me`
 * with nothing typed and nothing resolved is a claim about a POST, so it runs
 * against a real server on an ephemeral port.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { postsTheChoice } from '../testUtils.mjs';
import { SIGN_OFF, TEACH_ME } from '../items.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const aQuestion = (over = {}) => ({
  id: 'i-1',
  kind: 'question',
  title: 'Where does the teaching live?',
  body: 'A skill of its own, or the pilot writing it.',
  postedAt: '2026-09-19 09:00',
  options: ['a skill', 'the pilot writes it'],
  recommended: 'a skill',
  repo: 'D:\\work\\pilot',
  ...over,
});

const aSignoff = (over = {}) => aQuestion({ id: 'i-2', kind: 'signoff', options: ['satisfied'], recommended: undefined, ...over });

const aWalkthrough = (over = {}) => ({
  id: 'i-3',
  kind: 'walkthrough',
  title: 'Does the jobs page filter?',
  body: 'Three steps.',
  postedAt: '2026-09-19 09:00',
  screens: ['open /jobs → three jobs'],
  repo: 'D:\\work\\pilot',
  ...over,
});

/** The button exactly as the renderer writes it, the way S9 pins the walkthrough's. */
const TEACH_BUTTON = new RegExp(
  `<button type="submit" name="choice" value="${TEACH_ME}" class="teach" formnovalidate>`,
);

/**
 * Every button the page offers as a reply. Absence is asserted against this
 * rather than against the whole page, because every page inlines `deck.css` and
 * a stylesheet that mentions a class is not a button a user can press.
 */
const choicesOn = (html) => html.match(/name="choice" value="[^"]*"(?![^>]*>Confirm<)/g) ?? [];

/** The one row of choices on a page, so "last" is a claim about a position inside it. */
const choicesRowOf = (html) => {
  const row = /<div class="choices">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(row, 'the page renders no row of choices at all');
  return row[1];
};

test('a question offers "Teach me" on its thread, last in the row and not dressed as an answer', () => {
  const page = renderThreadPage(aQuestion());

  assert.match(page, TEACH_BUTTON, 'the same choices mechanism the options use (D22)');

  const row = choicesRowOf(page);
  assert.ok(
    row.indexOf('value="Teach me"') > row.indexOf('value="the pilot writes it"'),
    'the teaching comes after the answers: it is the deck\'s offer, not one of them',
  );
  assert.doesNotMatch(row, /<\/button>[^<]/, "no separator between the row's buttons");
  assert.match(row, /value="a skill"[^>]*>a skill <span class="quiet">\(recommended\)<\/span>/, 'the options are untouched');
  assert.ok(!/value="a skill"[^>]*class="teach"/.test(row), 'only the teaching carries the class that sets it apart');
  assert.match(page, /action="\/reply"/, 'it replies');
  assert.ok(!page.includes('/resolve'), 'only the pilot closes a thread');
});

test('a signoff offers it too, because a verdict is a decision the user may not understand yet', () => {
  assert.match(renderThreadPage(aSignoff()), TEACH_BUTTON);
});

test('a pilot that wrote the teaching into its own options gets one button, not two', () => {
  // The deck appends the teaching itself, so an option spelled the same way is the
  // same offer twice — two buttons posting one string, and the first of them dressed
  // as an answer the pilot would have to act on.
  const page = renderThreadPage(aQuestion({ options: ['a skill', TEACH_ME] }));

  assert.deepEqual(
    choicesOn(page).filter((choice) => choice.includes(`value="${TEACH_ME}"`)),
    [`name="choice" value="${TEACH_ME}"`],
    'exactly one teaching in the row',
  );
  assert.match(page, TEACH_BUTTON, "and it is the deck's own, which carries the class");
});

test('a question with no options still offers it', () => {
  // The teaching is the deck's own offer and not the pilot's, so it does not
  // depend on the pilot having attached anything to the item.
  const page = renderThreadPage(aQuestion({ options: undefined, recommended: undefined }));

  assert.match(page, TEACH_BUTTON);
});

test('a walkthrough offers no teaching — there is no decision in it to teach', () => {
  const page = renderThreadPage(aWalkthrough());

  assert.deepEqual(
    choicesOn(page),
    [`name="choice" value="${SIGN_OFF}"`],
    'its own one-click reply, and no teaching: a procedure is not a decision',
  );
  assert.deepEqual(choicesOn(renderHomePage([aWalkthrough()])), [
    `name="choice" value="${SIGN_OFF}"`,
  ], 'nor on its card');
});

test('a kind the deck does not know offers no teaching', () => {
  const page = renderThreadPage(aWalkthrough({ kind: 'handoff', screens: undefined }));

  assert.deepEqual(choicesOn(page), [], 'an item the pilot posted to itself is not the user\'s decision');
});

test('a resolved question offers no teaching, because the thread is closed', () => {
  const page = renderThreadPage(aQuestion({ resolvedAt: '2026-09-19 10:00', resolution: 'a skill it is' }));

  assert.deepEqual(choicesOn(page), [], 'a closed thread takes no reply at all');
});

test('the button is on the card as well, the way a question\'s options are', () => {
  const home = renderHomePage([aQuestion(), aSignoff()]);

  assert.equal(
    choicesOn(home).filter((choice) => choice.endsWith(`value="${TEACH_ME}"`)).length,
    2,
    'one on the question\'s card and one on the sign-off\'s',
  );
  assert.match(home, TEACH_BUTTON, 'written the same way on the card as in the thread');
});

test('clicking "Teach me" posts it as the reply with nothing typed and nothing closed', async (t) => {
  const stored = await postsTheChoice(
    t,
    {
      kind: 'question',
      title: 'Where does the teaching live?',
      body: 'A skill of its own, or the pilot writing it.',
      options: ['a skill', 'the pilot writes it'],
      recommended: 'a skill',
      repo: path.join('D:', 'work', 'pilot'),
    },
    TEACH_ME,
  );

  assert.deepEqual(
    stored.replies.map((reply) => reply.text),
    [TEACH_ME],
    'the pilot reads the button\'s own words and nothing else, which is what its hand-off rule matches on',
  );
  assert.ok(!stored.resolvedAt, 'and the thread is still open — the teaching is a message in it, not its end');
});
