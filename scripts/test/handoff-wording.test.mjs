/**
 * Line 11 of `docs/design/deck-workspace/architecture.md`. In the deck-usability run
 * (2026-09-20) a crew agent crossed the hard threshold, was told by
 * `hooks/context-size-guard.js` to stash and hand off, and finished its slice anyway.
 *
 * What stays here is the lint: every crew definition carries the passage, the six say the
 * same thing word for word, no passage restates a threshold the hook owns, and the
 * off-deck notice names nothing an ordinary session lacks. The passage's own sentences
 * are not pinned.
 *
 * `agents/pilot.md` is deliberately not in the list: the pilot's own hand-off is to
 * bring the status table current and run `pilot handoff`, which is a different
 * procedure, pinned against the skill in `hooks/test/session-handoff.test.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The six crew agents the pilot spawns. Each one owns a context it can run out of. */
const CREW = [
  'pilot-explorer',
  'pilot-architect',
  'pilot-implementer',
  'pilot-fundamentalist',
  'pilot-qa',
  'pilot-teacher',
];

const HEADING = '## When the context notice arrives';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const handoffPassage = (name) => {
  const source = read(`agents/${name}.md`);
  const match = /## When the context notice arrives\r?\n([\s\S]*?)(\r?\n## |\r?\n?$)/.exec(source);
  assert.ok(match, `agents/${name}.md has no "${HEADING}" section`);
  return match[1].trim();
};

/**
 * Whitespace and line wrapping are not the wording; compare what the words say. Since
 * co-pilot-reports S1 (ADR 0099) a crew agent a co-pilot may spawn sends to "your
 * addressee", which is `main` for an agent the main session spawned: the same passage.
 */
const normalise = (text) => text.trim().replace(/\s+/g, ' ').replace(/your addressee/g, '`main`');

test('the six crew definitions carry the same hand-off passage, word for word', () => {
  // lint: six copies that drift are six procedures; the passage is role-neutral so it can be identical
  const [first, ...rest] = CREW;
  const expected = normalise(handoffPassage(first));
  for (const name of rest) {
    assert.equal(
      normalise(handoffPassage(name)),
      expected,
      `agents/${name}.md states the hand-off differently from agents/${first}.md`,
    );
  }
});

test('the passage says what to do and never what the threshold is', () => {
  // The numbers live in hooks/context-size-guard.js and nowhere else. A percentage
  // copied into prose is a second copy that goes stale the day a threshold moves —
  // and S7 moved them for crew agents already.
  for (const name of CREW) {
    // lint: no percentage threshold in the hand-off passage
    assert.doesNotMatch(
      handoffPassage(name),
      /\d+\s*(%|per\s*cent|percent)/i,
      `agents/${name}.md restates a threshold the hook owns; the hook says when, the passage says what`,
    );
  }
});

/**
 * The guard writes its notices as string literals concatenated across lines. Joining the
 * glue back up lets this file read the notice's words instead of its source layout, so
 * reformatting the hook — or moving it to template literals — leaves the lint standing.
 */
const noticeWords = (source) => source.replace(/['`]\s*\+\s*['`]/g, '');

test('noticeWords joins string literals concatenated across lines', () => {
  assert.equal(
    noticeWords("'Stash and hand off ' +\n      'now.'"),
    "'Stash and hand off now.'",
  );
});

test('the notice off the deck names nothing an ordinary session does not have', () => {
  // An ordinary session on this machine owns no slice branch, no brief and no `main`.
  const guard = noticeWords(read('hooks/context-size-guard.js'));
  const notice = /Wrap up now, in this order:([\s\S]*?)This is advice and never a block\. Said once\./.exec(guard);
  assert.ok(notice, 'hooks/context-size-guard.js no longer tells a session off the deck to wrap up');

  // lint: the off-deck notice never names a wip commit, slice branch, SendMessage or main
  assert.doesNotMatch(
    notice[0],
    /`wip:`|slice branch|SendMessage|`main`/,
    'and it still names nothing an ordinary session does not have',
  );
});
