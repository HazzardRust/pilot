/**
 * "The status in the preview of 'the pilot has it' needs to be colour coded
 * and also needs to be visible inside the actual thread, not just the
 * preview." The bar's five words (`threadState`, `items.mjs`) already told a
 * card apart from a settled one by text alone; this buckets them into the
 * three the user asked to tell apart at a glance — waiting on the user, with
 * the pilot, resolved — and draws the same coloured label on the thread page's
 * own header, from one function so the two can never say it two ways.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';

const { postItem, addReply, addPilotMessage, resolveItem, listItems } = await import('../store.mjs');
const { renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

const A = path.join('D:', 'work', 'alpha');
const stateSpan = (html) => /<span class="state"[^>]*>([^<]*)<\/span>/.exec(html);
const reread = (id) => listItems().find((item) => item.id === id);

test('a fresh question reads waiting, and is shown on the thread page too, not only the preview', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: A });

  const thread = renderThreadPage(item);
  assert.match(
    thread,
    /<span class="state" data-state="waiting">posted<\/span>/,
    'the state used to be the card\'s alone; it is on the thread header now',
  );
});

test('the three buckets a card and a thread agree on: waiting, the pilot, resolved', (t) => {
  tempDeck(t);
  const posted = postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: A });
  const bucketFor = (item) => stateSpan(renderThreadPage(item))?.[0].match(/data-state="([a-z]+)"/)?.[1];

  assert.equal(bucketFor(reread(posted.id)), 'waiting', 'posted: nobody has answered yet');

  addReply(posted.id, '4321');
  assert.equal(bucketFor(reread(posted.id)), 'pilot', 'not picked up yet: with the pilot');

  addPilotMessage(posted.id, 'Why not 4317?', '');
  assert.equal(bucketFor(reread(posted.id)), 'waiting', 'the pilot replied: back to the user');

  resolveItem(posted.id, 'went with 4321');
  assert.equal(bucketFor(reread(posted.id)), 'resolved', 'resolved: done');
});

test('a card and the thread page draw the very same state markup for the same item', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: A });

  const onCard = stateSpan(renderHomePage([item], [], A))?.[0];
  const onThread = stateSpan(renderThreadPage(item))?.[0];

  assert.ok(onCard, 'the card must draw a state span');
  assert.equal(onCard, onThread, 'one function renders the label for both pages');
});

test('each bucket has its own colour, and it is named beside the stylesheet\'s other custom properties', () => {
  const css = uiFile('deck.css');
  const root = css.match(/:root \{[\s\S]*?\n\}/)[0];

  for (const bucket of ['waiting', 'pilot', 'resolved', 'unacknowledged']) {
    assert.match(root, new RegExp(`--state-${bucket}:`), `no custom property for the ${bucket} bucket`);
  }

  const rules = css.match(/\.state\[data-state="[a-z]+"\][^{]*\{[^}]*\}/g) ?? [];
  // Four since thread-kinds S9: a hand-off nobody has picked up waits on neither side (spec 19).
  assert.equal(rules.length, 4, 'one rule per bucket, coloured from the custom properties above');
  for (const rule of rules) {
    assert.match(rule, /color:\s*var\(--state-/, rule);
  }
});
