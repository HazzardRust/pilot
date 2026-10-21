/**
 * S12 of thread-kinds, spec 25 (L15, ADR 0057): the `spec` kind is retired. The spec
 * lives in the artefact's §2 and the user reads it at Gate 1, so a post of it is refused
 * by name, and a spec stored before the retirement draws as an unknown kind, with Dismiss.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, POSTABLE_KINDS, TEACH_ME, appearsInYours, isKnownKind, isOpen } from '../items.mjs';
import { DeckRefusal, dismissItem, listItems, postItem } from '../store.mjs';
import { TOOLS } from '../tools.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { postStored, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/pilot';

test('deck_post with kind spec is refused saying it is retired', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: 'spec', title: 'The spec', body: '1. It works.', repo: REPO }),
    (error) => error instanceof DeckRefusal && /^kind spec is retired: .*artefact.*Gate 1/.test(error.message),
  );
  assert.equal(listItems().length, 0, 'nothing is stored');
});

test('a stored spec item draws with Dismiss and no agree buttons', (t) => {
  tempDeck(t);
  const spec = postStored({ kind: 'spec', title: 'An old spec', body: '1. It works.', repo: REPO, options: ['agree', 'agree with edits'] });
  assert.equal(isKnownKind('spec'), false, 'an unknown kind now');
  const page = renderThreadPage(spec, [spec], []);
  assert.match(page, /An old spec/);
  assert.match(page, /class="dismiss-item"/, 'Dismiss is drawn');
  assert.doesNotMatch(page, /name="choice" value="agree/, 'no agree buttons');
  assert.doesNotMatch(page, new RegExp(`value="${TEACH_ME}"`));
  dismissItem(spec.id);
  const after = listItems().find((item) => item.id === spec.id);
  assert.equal(after?.kind, 'spec', 'kept, not deleted');
  assert.equal(isOpen(after), false, 'Dismiss closes it');
  assert.equal(appearsInYours(after), false);
});

test("the deck_post schema's kind enum has no spec", () => {
  const post = TOOLS.find((tool) => tool.name === 'deck_post');
  assert.ok(!post.inputSchema.properties.kind.enum.includes('spec'));
  assert.ok(!KINDS.includes('spec') && !POSTABLE_KINDS.includes('spec'));
  assert.doesNotMatch(post.description, /\bspec\b/, 'the description names no spec');
});
