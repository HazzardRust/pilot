/**
 * The walkthrough of 2026-09-19: "i pressed dismiss on 2 sessions, i want a
 * confirmation stage so that i dont accidentally end something early".
 *
 * Dismissing is reversible — the run is back the moment it posts anything, and
 * nothing of it is deleted (D13, L14) — but it takes a tab off the deck under
 * someone who was reading it, and the button sat one stray click away from the
 * status panel's own rows. So it asks first.
 *
 * The question is asked in the place the button was, by the page and not by the
 * browser: `confirm()` is a dialog the deck cannot put on the same line, cannot
 * style like the rest of the panel, and cannot be tested without a browser.
 *
 * Deck-workspace answered the other half of that stray click: the control is off
 * the status panel altogether and lives on `/items` alone (spec 8, L10), where
 * the question also names what dismissing costs (A4). Both are pinned below,
 * because "the panel has no dismiss" is a claim that goes quiet the moment
 * someone puts one back.
 *
 * What is on the page is a claim about bytes, so it runs against the renderer's
 * own output — including that a browser with no script at all still has the
 * button it always had. Since S3 of handoff-failed-confirm the press confirms in
 * place on the one seam, and `confirm.test.mjs` presses it there.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';

const { listItems, listRuns, listStoredRuns, postItem, registerRun, setSlices } =
  await import('../store.mjs');
const { renderDeckPage, renderHomePage } = await import('../ui/render.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

const REPO = path.join('D:', 'work', 'pilot');

const aDeckWithARun = () => {
  const run = registerRun({ repo: REPO, pid: process.pid });
  setSlices(run.id, [{ slice: '10 stale runs', state: 'doing' }]);
  postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: REPO });
  return run;
};

/** The dismiss form on a page, whichever of the two places drew it. */
const dismissForm = (page) => /<form class="dismiss"[\s\S]*?<\/form>/.exec(page)?.[0] ?? null;

// --- what is on the page ----------------------------------------------------

test('the dismiss control carries its own question, and the question starts hidden', (t) => {
  tempDeck(t);
  const run = aDeckWithARun();

  const form = dismissForm(renderDeckPage(listItems(), listRuns()));

  assert.ok(form, '/items draws the control');
  assert.ok(form.includes(`name="id" value="${run.id}"`), 'it names the run');
  assert.match(form, /<button type="submit"[^>]* data-confirm>dismiss<\/button>/, 'it confirms in place');
  assert.match(form, /<div class="step sure" hidden><p>Dismiss this run\?/, 'it carries the question');
  assert.match(form, /<button type="submit">Confirm<\/button>/, 'it offers Confirm');
});

/**
 * Spec 8 and L10: "A button that wipes a run sits in the panel the user reads
 * most". The status panel is the run's own slice table — what is on screen
 * while the work is being read — and the control that takes the run off the
 * deck sat one stray click from its rows. It is removed from there and kept
 * where it is reached on purpose: the list of runs at the top of `/items`.
 */
test('the status panel has no dismiss, and /items still has one', (t) => {
  tempDeck(t);
  aDeckWithARun();

  const home = renderHomePage(listItems(), listStoredRuns(), REPO);

  assert.match(home, /class="run-status"/, 'the panel this is about is on the page');
  assert.match(home, /10 stale runs/, 'with the rows the run posted');
  assert.equal(dismissForm(home), null, 'and nothing on it that takes the run off the deck');
  assert.doesNotMatch(home, /action="\/dismiss"/, 'by any other markup either');

  assert.ok(dismissForm(renderDeckPage(listItems(), listRuns())), '/items keeps the control');
});

/**
 * Spec 8: "where it does live it names what it destroys". Dismissing destroys
 * nothing — the run is back the moment it posts anything (D13, L14) — so the
 * sentence says what does go: the status rows, off the deck, while the items
 * stay on the page the button is on (A4).
 */
test('the question names what dismissing costs', (t) => {
  tempDeck(t);
  aDeckWithARun();

  const question = /<div class="step sure" hidden><p>([\s\S]*?)<\/p>/.exec(
    dismissForm(renderDeckPage(listItems(), listRuns())),
  )[1];

  assert.match(question, /status rows/, 'it names the rows that leave the deck');
  assert.match(question, /items stay on this page/, 'and that the items do not go with them');
  assert.match(question, /posts again/, 'and that the run comes back on its own');
});

test('a browser running no script still has the button it always had', (t) => {
  tempDeck(t);
  aDeckWithARun();

  const form = dismissForm(renderDeckPage(listItems(), listRuns()));

  assert.ok(form.includes('method="post" action="/dismiss"'), 'the same form post as before');
  // `hidden` is the platform's own, so the question is not on screen for a page
  // whose script never ran, and the one control that is on screen submits.
  assert.match(form, /class="step sure" hidden/, 'and the question it cannot ask is not shown');
});

test('the stylesheet does not give the question a display that would beat hidden', () => {
  const css = fs.readFileSync(path.join(UI, 'deck.css'), 'utf8');
  const rules = css.match(/^[^{]*\.sure[^{]*\{[^}]*\}/gm) ?? [];

  assert.ok(rules.length, 'the question is styled at all');
  for (const rule of rules) {
    if (!/display\s*:/.test(rule)) continue;
    assert.match(
      rule,
      /:not\(\[hidden\]\)/,
      `a display on .sure has to exclude the hidden one, or it beats the attribute: ${rule}`,
    );
  }
});
