/**
 * Whether a crew question's recommended default says what research it rests on (bigger-jobs
 * spec 8, A1, A7; grilling, ADR 0119): one line-start `Research:` line, researched or
 * `Research: none, <skip reason>` with the reason from grilling's skip list. Pure: the body
 * in, the gaps out, so `postItem` refuses before it reads the store.
 */

import { authorKind } from './items.mjs';

/** ADR 0119's owners (A7); the auditor, the teacher and the user are not checked. */
const CHECKED = new Set(['pilot', 'architect', 'qa']);
const RESEARCH_LINE = /^ {0,3}Research:[ \t]*(\S[^\n]*)$/gm;
const NONE = /^none[ \t]*(,|$)/i;

/** Grilling's skip list, word for word; a test holds each to the skill's sentence. */
export const SKIP_REASONS = Object.freeze([
  'codebase fact',
  'preference',
  'scope call',
  'decision already locked or covered by an ADR',
  'research already done for it this run',
]);
const SKIPPED = new RegExp(`^none,[ \t]*(?:an? )?(?:${SKIP_REASONS.join('|')})(?![a-z])`, 'i');

const GAP = `a Research: line (Research: <what was read>, <n> sources, favours <option>; or Research: none, <skip reason>, the reason from grilling's skip list: ${SKIP_REASONS.join(', ')})`;

/** The gaps in `body`, `[]` unless `recommended` is set and the author is the pilot, the architect or QA. */
export function questionShapeGaps(body, { recommended, author } = {}) {
  if (recommended === undefined || !CHECKED.has(authorKind(author))) return [];
  const lines = [...body.matchAll(RESEARCH_LINE)].map(([, text]) => text.trim());
  const shaped = lines.some((text) => (NONE.test(text) ? SKIPPED.test(text) : true));
  return shaped ? [] : [GAP];
}
