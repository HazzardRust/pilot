/**
 * S1 of bigger-jobs: the deck refuses a crew question whose recommended default carries no
 * `Research:` line (spec 8, A1, A7, ADR 0119). Every test takes its own store; nothing touches 4321.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import { SKIP_REASONS, questionShapeGaps } from '../question-shape.mjs';

const { DeckRefusal, listItems, postItem } = await import('../store.mjs');

const GAP =
  "a Research: line (Research: <what was read>, <n> sources, favours <option>; or Research: none, <skip reason>, the reason from grilling's skip list: codebase fact, preference, scope call, decision already locked or covered by an ADR, research already done for it this run)";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const grilling = () => fs.readFileSync(path.join(root, 'skills', 'grilling', 'SKILL.md'), 'utf8');
const ASK = 'Which one?\n\nRecommended: keep it, because it is cheaper.';
const aQuestion = (body, author) => ({
  kind: 'question',
  title: 'Keep it?',
  body,
  options: ['keep it', 'drop it'],
  recommended: 'keep it',
  author,
});

test('a crew question with recommended and no Research line is refused', () => {
  for (const author of ['', 'pilot:pilot', 'pilot:pilot-architect', 'pilot:pilot-qa']) {
    assert.deepEqual(questionShapeGaps(ASK, { recommended: 'keep it', author }), [GAP], JSON.stringify(author));
  }
  assert.deepEqual(questionShapeGaps(`${ASK}\nWe did Research: later.`, { recommended: 'keep it', author: '' }), [GAP], 'only a line-start Research: counts');
  for (const line of ['Research: none', 'Research: none,', 'Research:']) {
    assert.deepEqual(questionShapeGaps(`${ASK}\n${line}`, { recommended: 'keep it', author: '' }), [GAP], `${line} has no reason`);
  }
  assert.deepEqual(
    questionShapeGaps(`${ASK}\nResearch: none of the docs cover it, 2 sources, favours keep it`, { recommended: 'keep it', author: '' }),
    [],
    'a researched line starting with the word none is not the skip form',
  );
  assert.deepEqual(
    questionShapeGaps(`${ASK}\n  Research: none, scope call`.replaceAll('\n', '\r\n'), { recommended: 'keep it', author: 'pilot:pilot-qa' }),
    [],
    'an indented line in a CRLF body counts',
  );
  assert.deepEqual(
    questionShapeGaps(`${ASK}\nResearch: OWASP ASVS 5.0, 2 sources, favours keep it`, { recommended: 'keep it', author: '' }),
    [],
    'a researched line passes',
  );
});

test('Research: none with a skip reason passes', () => {
  for (const reason of SKIP_REASONS) {
    assert.deepEqual(questionShapeGaps(`${ASK}\nResearch: none, ${reason}`, { recommended: 'keep it', author: 'pilot:pilot-architect' }), [], reason);
    assert.deepEqual(questionShapeGaps(`${ASK}\nResearch: none, a ${reason}: the hook reads it`, { recommended: 'keep it', author: 'pilot:pilot' }), [], `a ${reason}`);
  }
  assert.equal(SKIP_REASONS.length, 5, 'the five skip reasons');
});

test('Research: none with a reason off the skip list is refused', () => {
  for (const reason of ['workflow-policy choice', 'obvious', 'preferences of the team aside']) {
    assert.deepEqual(questionShapeGaps(`${ASK}\nResearch: none, ${reason}`, { recommended: 'keep it', author: 'pilot:pilot' }), [GAP], reason);
  }
});

test('a bare Research: none in a CRLF body is refused', () => {
  assert.deepEqual(questionShapeGaps(`${ASK}\nResearch: none\n`.replaceAll('\n', '\r\n'), { recommended: 'keep it', author: 'pilot:pilot' }), [GAP]);
  assert.deepEqual(questionShapeGaps(`${ASK}\nResearch: none,\t\n`.replaceAll('\n', '\r\n'), { recommended: 'keep it', author: 'pilot:pilot' }), [GAP]);
});

test("every reason the deck accepts is in grilling's skip list", () => {
  const skip = grilling().match(/\*\*skip\*\* research for ([^.]*)\./)?.[1];
  assert.ok(skip, "grilling's skip list sentence");
  for (const reason of SKIP_REASONS) assert.ok(skip.includes(reason), `${reason} is in grilling's skip list`);
});

test('a question with no recommended, or from the user or the auditor, is not checked', () => {
  assert.deepEqual(questionShapeGaps(ASK, { author: '' }), [], 'no recommended');
  assert.deepEqual(questionShapeGaps(ASK, {}), [], 'nothing given');
  for (const author of [undefined, 'pilot:pilot-auditor', 'pilot:pilot-teacher', 'pilot:pilot-implementer', 'Explore']) {
    assert.deepEqual(questionShapeGaps(ASK, { recommended: 'keep it', author }), [], String(author));
  }
});

test('the deck refuses the post and stores nothing', (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem(aQuestion(ASK, 'pilot:pilot')),
    (error) =>
      error instanceof DeckRefusal &&
      error.message === `a question with a recommended default carries a Research: line (grilling, ADR 0119); missing: ${GAP}`,
  );
  assert.equal(listItems().filter((item) => item.kind === 'question').length, 0, 'nothing stored');
  const posted = postItem(aQuestion(`${ASK}\nResearch: none, scope call`, 'pilot:pilot'));
  assert.equal(listItems().find((item) => item.id === posted.id)?.recommended, 'keep it');
});

test('grilling names the skip line, build-now and the read by id', () => {
  const skill = grilling();
  assert.match(skill, /`Research: none, <skip reason>`/, 'the skip line');
  assert.match(skill, /build it in the run, never a later ticket/i, 'build-now');
  assert.match(skill, /\*\*the build-now rule\*\*/i, 'the rule is named where agents point to it');
  assert.match(
    skill,
    /a found issue, a defect, flake, weakness or seam found during a run beside or under the work in hand, not a wish to tidy code the run did not touch/i,
    'a found issue is defined once',
  );
  assert.match(skill, /an added spec line and slice with no question; only one that moves a decision already locked is asked/, 'the rail');
  assert.match(skill, /deck_read[^\n]*\bby `?id`?/, 'the read by id');
  assert.doesNotMatch(skill, /returns every item/, 'no longer reads every item');
});
