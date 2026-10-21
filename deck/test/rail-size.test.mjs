/**
 * The rail's bookmarks read down the edge (`writing-mode: vertical-rl`,
 * `deck.css:612`), so their inline axis is the vertical one and a longer
 * label is a *taller* box, not a wider one — the axis `everything.test.mjs`
 * already pins the open/lit states against ("just gains more width ... which
 * just looks silly", walkthrough #2).
 *
 * Two labels change length while every other bookmark's text is fixed:
 * Notifications gains " N" or " NN" the moment a thread goes unseen
 * (`data-count`, `deck.css:710`), and the Everything toggle reads "Open" or
 * "All" (`render.mjs`'s `renderEverything`). Either change used to push every
 * bookmark under it down the strip. Both are reserved to their own longest
 * label here, the same fix in spirit as the state rules: the box stands
 * still and only its content changes.
 *
 * Reserved to that label and no more, in the bookmark's own units: one `ch`
 * (a monospace cell) plus the 0.08em letter-spacing per character, and the
 * text centred along the reserved length. A fixed rem once overshot the
 * Open/All label by half again and left it hanging at the top of its box
 * ("the OPEN/ALL button is now too big, and the text in it is uncentred").
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');
const reserves = (label) => `inline-size: calc(${label.length} * (1ch + 0.08em))`;

test("Notifications' bookmark reserves room for its longest count, so an unseen thread does not resize it", () => {
  const css = uiFile('deck.css');
  const rules = css.match(/^[^{\n]*#notifications > summary[^{]*\{[^}]*\}/gm) ?? [];

  assert.ok(rules.length, 'no rule reserves size for the Notifications bookmark specifically');
  for (const rule of rules) {
    assert.ok(rule.includes(reserves('Notifications 99')), 'the vertical axis (inline, under vertical-rl) must fit "Notifications 99" and no more');
    assert.match(rule, /text-align: center/, 'the label must sit centred in its reserved length');
  }
});

test('the Open/All toggle reserves room for the longer of the two words', () => {
  const css = uiFile('deck.css');
  const rules = css.match(/^[^{\n]*\.everything[^.\n][^{]*\{[^}]*\}/gm) ?? [];
  const sized = rules.filter((rule) => rule.includes(reserves('Open')));

  assert.ok(sized.length, 'no rule reserves exactly the length of "Open" for the Everything toggle');
  for (const rule of sized) assert.match(rule, /text-align: center/, 'the word must sit centred in its reserved length');
});
