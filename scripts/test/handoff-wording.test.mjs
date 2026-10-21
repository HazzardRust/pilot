/**
 * Line 11 of `docs/design/deck-workspace/architecture.md`. In the deck-usability run
 * (2026-09-20) a crew agent crossed the hard threshold, was told by
 * `hooks/context-size-guard.js` to stash and hand off, and finished its slice anyway.
 * The notice had fired; nothing in the agent's own definition said the notice was an
 * instruction, so the agent weighed it against the work in hand and the work won.
 *
 * This is the seam available for that: a unit test cannot drive the live model call
 * that reproduced it (non-deterministic, real API calls), but it can prove that every
 * crew definition carries the stash-and-hand-off procedure in its own voice, that the
 * six say the same thing, and that the passage and the hook's notice ask for the same
 * four actions — so the runtime notice and the definition can never drift into
 * contradicting each other, and a file that quietly lost the passage fails here.
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

test('every crew definition tells its agent to stop, stash and hand off', () => {
  for (const name of CREW) {
    const passage = handoffPassage(name);
    const where = `agents/${name}.md`;

    assert.match(
      passage,
      /^- \*\*[^*]+\.\*\*/,
      `${where}: the passage must be a "- **Bold label.**" item, as the crew files write a standing rule`,
    );
    assert.match(
      passage,
      /instruction,\s+not\s+advice/i,
      `${where}: must say the notice is an instruction, not advice the agent weighs against the work in hand`,
    );
    assert.match(
      passage,
      /begin\s+nothing\s+new/i,
      `${where}: must say the first notice means begin nothing new`,
    );
    assert.match(
      passage,
      /`wip:`\s+commit/i,
      `${where}: must name the wip: commit that puts the work somewhere it survives`,
    );
    assert.match(
      passage,
      /staging\s+by\s+name\s+only\s+the\s+files\s+you\s+changed/i,
      `${where}: must say what is staged, by name, so a hand-off never becomes a git add -A`,
    );
    assert.match(
      passage,
      /handoff\s+a\s+fresh\s+agent\s+could\s+be\s+briefed\s+from/i,
      `${where}: must say the handoff is written for a fresh agent, not as a note to self`,
    );
    assert.match(
      passage,
      /what\s+is\s+done,\s+what\s+is\s+not/i,
      `${where}: the handoff must carry what is done and what is not`,
    );
    assert.match(
      passage,
      /written\s+down\s+nowhere\s+else/i,
      `${where}: the handoff must carry what was learned that is written down nowhere else`,
    );
    assert.match(
      passage,
      /the\s+exact\s+next\s+step/i,
      `${where}: the handoff must carry the exact next step`,
    );
    assert.match(
      passage,
      /send\s+it\s+to\s+(`main`|your\s+addressee)\s+with\s+`SendMessage`/i,
      `${where}: must say where the handoff goes and by which tool`,
    );
    assert.match(
      passage,
      /stop\s+there/i,
      `${where}: must say the agent stops there rather than carrying on to the end`,
    );
  }
});

test('the six crew definitions carry the same hand-off passage, word for word', () => {
  // Six copies that drift are six procedures. The passage is deliberately
  // role-neutral so it can be identical: a read-only agent is covered by the
  // clause about having nothing to stash, not by a sentence of its own.
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
 * reformatting the hook — or moving it to template literals — leaves the pin standing.
 */
const noticeWords = (source) => source.replace(/['`]\s*\+\s*['`]/g, '');

test('noticeWords joins string literals concatenated across lines', () => {
  // The guard writes its notice as adjacent 'literal' +\n  'literal' segments; this is
  // the seam the wording test below relies on to read the notice as prose. Pin the
  // helper's own contract directly, since nothing else here exercises it: no pinned
  // phrase in today's notice happens to straddle a `+` seam, so bypassing the helper
  // (e.g. `source.replace(/\+/g, '')`) would still pass every other assertion in this
  // file.
  assert.equal(
    noticeWords("'Stash and hand off ' +\n      'now.'"),
    "'Stash and hand off now.'",
  );
});

test('the passage and the hook\'s hand-off notice ask a crew agent for the same four things', () => {
  // The incident was a notice and a definition that could disagree. They cannot now:
  // if the hook's procedure changes, this fails until the six definitions follow.
  const guard = noticeWords(read('hooks/context-size-guard.js'));
  const notice = /Stash and hand off now, in this order:([\s\S]*?)Said once\./.exec(guard);
  assert.ok(notice, 'hooks/context-size-guard.js no longer tells a crew agent to stash and hand off');

  // Test A already runs these same four regexes against `inNotice`'s counterpart
  // wording in all six crew passages, and the test above proves the six passages are
  // identical, so checking the passage here again would be redundant with both.
  const actions = [
    ['the wip: commit', /`wip:` subject/i],
    ['writing the handoff', /Write a handoff a fresh agent could be briefed from/i],
    ['sending it to main', /Send that handoff to `main` with SendMessage/i],
    ['stopping there', /Stop there\. Do not begin the next step/i],
  ];

  for (const [what, inNotice] of actions) {
    assert.match(notice[0], inNotice, `the hook's notice no longer asks for ${what}`);
  }
});

test('the notice off the deck asks for the same four things in words that assume nothing', () => {
  // The other half of the hard crossing, and the one no agent definition backs: an
  // ordinary session on this machine owns no slice branch, no brief and no `main`, so
  // its notice has to ask for the same four actions without naming any of them. Only
  // the on-deck wording was pinned, so this one could have lost a step in silence.
  const guard = noticeWords(read('hooks/context-size-guard.js'));
  const notice = /Wrap up now, in this order:([\s\S]*?)This is advice and never a block\. Said once\./.exec(guard);
  assert.ok(notice, 'hooks/context-size-guard.js no longer tells a session off the deck to wrap up');

  const actions = [
    ['saving the work the way the project already does', /Put what you have somewhere it survives this session, the way this project already saves work/i],
    ['writing down what is done and what is next', /Write down what is done, what is not, what you learned[\s\S]*?the exact next step/i],
    ['giving it to whoever is waiting', /Give that to whoever is waiting on you/i],
    ['stopping there', /Stop there\. Do not begin the next thing/i],
  ];

  for (const [what, inNotice] of actions) {
    assert.match(notice[0], inNotice, `the off-deck notice no longer asks for ${what}`);
  }

  assert.doesNotMatch(
    notice[0],
    /`wip:`|slice branch|SendMessage|`main`/,
    'and it still names nothing an ordinary session does not have',
  );
});
