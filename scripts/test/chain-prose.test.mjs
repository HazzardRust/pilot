/**
 * The take and the cut follow the base line (pilot-develop-line S8, spec 4, 4d, 4e; A2, A6, A7).
 * `pilot base` names `pilot` or a concluding `feat/<N>`: the take syncs only on pilot, the
 * architect cuts, rebases and opens the feature PR on that base, and a refusal for a dropped N is
 * a fix round, not a landing.
 * Prompt files are pinned by text: each assertion names the rule a rewrite must keep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Normalised to one line: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

/** The sentences of `text` that match `pattern`. */
const sentences = (text, pattern) => text.split(/(?<=\.) /).filter((s) => pattern.test(s));

const PILOT = read('agents/pilot.md');
const ARCHITECT = read('agents/pilot-architect.md');

test('a chained take skips the sync', () => {
  assert.match(PILOT, /run `pilot base`, then `pilot sync` only on `base pilot`/, 'A7: a chained take skips pilot sync');
  const first = sentences(PILOT, /first `deck_status`/);
  assert.ok(first.some((s) => /`base`/.test(s)), "spec 4: the run's first deck_status carries base");
});

test('the architect targets the base', () => {
  assert.match(ARCHITECT, /gh pr create --draft --base <base branch> --head feat\/<slug>/, 'A6: the feature PR targets the base line');
  assert.doesNotMatch(ARCHITECT, /--base pilot --head/, 'no feature PR hard-codes pilot');
  const where = sentences(ARCHITECT, /`base feat\/<N>`/);
  assert.ok(where.some((s) => /`feat\/<N>` replaces `pilot` in each ref/.test(s)), 'a chained line cuts and rebases on feat/<N>');
});

test('a dropped base goes to a fix brief', () => {
  const round = sentences(PILOT, /built on feat\/<N>`/);
  assert.equal(round.length, 1, 'one sentence handles the refusal');
  assert.match(round[0], /fix brief/, 'A2: the fix round takes it');
  assert.match(round[0], /revert/, 'it reverts N');
  assert.match(round[0], /gate2/, 'then a fresh gate2');
  assert.doesNotMatch(round[0], /lander/, 'no lander for a dropped base');
});
