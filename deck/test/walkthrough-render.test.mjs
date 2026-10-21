/**
 * A QA walkthrough's thread page draws its detail (URL, Login, Steps) before its body, so the
 * checked-for-you table the body carries sits under the steps (walkthrough-taste spec 3, L1).
 * A wizard's walkthrough (no author, or the pilot) and every other kind keep the body first.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_REPORT, KIND_WALKTHROUGH } from '../items.mjs';
import { postItem } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const TABLE = '| Checked | Result |\n| --- | --- |\n| login | pass |\n| save | pass |';
const SCREENS = ['Open the board', 'Press New'];

const threadOf = (item) => renderThreadPage(item, [item], []);
const post = (kind, fields = {}) =>
  postItem({ kind, title: `A ${kind}`, body: TABLE, repo: REPO, ...fields });

test("a QA walkthrough's body table follows its steps", (t) => {
  tempDeck(t);
  const page = threadOf(post(KIND_WALKTHROUGH, { screens: SCREENS, author: 'pilot:pilot-qa' }));
  const steps = page.indexOf('<ol class="steps">');
  const table = page.indexOf('<table');
  assert.ok(steps !== -1 && table !== -1);
  assert.ok(steps < table, 'steps come before the body table');
});

test("a wizard walkthrough keeps its body before its steps (spec 9, L3)", (t) => {
  tempDeck(t);
  for (const author of [undefined, 'pilot:pilot']) {
    const page = threadOf(post(KIND_WALKTHROUGH, { screens: SCREENS, author }));
    assert.ok(page.indexOf('<table') < page.indexOf('<ol class="steps">'), String(author));
  }
});

test('a walkthrough with no steps draws the table alone', (t) => {
  tempDeck(t);
  const page = threadOf(post(KIND_WALKTHROUGH));
  assert.ok(page.includes('<table'));
  assert.ok(!page.includes('<ol class="steps">'));
  assert.ok(!page.includes('<dt>Steps</dt>'));
});

test('a closing report and a gate keep the body first', (t) => {
  tempDeck(t);
  const report = threadOf(post(KIND_REPORT, { screens: SCREENS }));
  assert.ok(report.includes('<ol class="steps">'));
  assert.ok(report.indexOf('<table') < report.indexOf('<ol class="steps">'));
  const gate = threadOf(postItem({
    kind: KIND_GATE1, title: 'A gate1', body: TABLE, repo: REPO,
    ...withTicket({ artefact: 'a.md', sha: 'abc1234', locked: 1, slices: '| S | D |\n| --- | --- |\n| S1 | x |' }, REPO, 'red'),
  }));
  assert.ok(gate.indexOf('<table') < gate.indexOf('<dl class="detail">'));
});
