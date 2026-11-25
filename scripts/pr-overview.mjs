/**
 * The `## Overview` of a feature's artefact, the plain summary a PR opens with (pr-overview S1; L2, L3):
 * the section read out of the markdown, the rules a person-facing text has to meet, and the built count
 * the feature PR adds under it. Pure: the caller hands in the markdown, the record and the role names.
 */

import fs from 'node:fs';

/** At most this many words in an overview. */
const MAX_WORDS = 150;
/** Sentences average at most this many words. */
const MAX_AVERAGE = 20;

/** The `## Overview` section's body, heading excluded, to the next `## ` outside a fence; null when absent or empty. */
export function overviewOf(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let end = lines.length;
  for (let at = 0; at < lines.length; at++) {
    if (/^\s*(```|~~~)/.test(lines[at])) fenced = !fenced;
    if (fenced) continue;
    if (start === -1 && /^## Overview\s*$/.test(lines[at])) start = at + 1;
    else if (start !== -1 && lines[at].startsWith('## ')) {
      end = at;
      break;
    }
  }
  if (start === -1) return null;
  const body = lines.slice(start, end).join('\n').trim();
  return body === '' ? null : body;
}

/** The crew's role words: `agents/pilot-<role>.md` in `agentsDir`, as `<role>`. */
export function crewRoles(agentsDir) {
  return fs
    .readdirSync(agentsDir)
    .map((name) => /^pilot-(.+)\.md$/.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `{ line, rule, message }` for each place `text` breaks a rule; `roles` are the crew role words. */
export function overviewProblems(text, roles) {
  const problems = [];
  const lines = String(text).split(/\r?\n/);
  const tokens = [
    ['a slice id', /(?<![\w-])S\d+(?![\w-])/g],
    ['an item id', /(?<![\w-])itm_[0-9a-f]+/g],
    ['a decision id', /(?<![\w-])[AL]\d+(?![\w-])/g],
    ['an ADR number', /(?<![\w-])ADR \d{4}(?!\d)/g],
    ...(roles.length === 0 ? [] : [['a crew role name', new RegExp(`(?<![\\w-])(?:${roles.map(escape).join('|')})(?![\\w-])`, 'gi')]]),
  ];
  lines.forEach((content, at) => {
    for (const [what, pattern] of tokens) {
      for (const match of content.matchAll(pattern)) {
        problems.push({ line: at + 1, rule: 'overview-token', message: `${what}: ${match[0]}` });
      }
    }
  });

  const words = (chunk) => chunk.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  const total = words(String(text));
  if (total > MAX_WORDS) problems.push({ line: 1, rule: 'overview-long', message: `${total} words, at most ${MAX_WORDS}` });
  const sentences = String(text).split(/[.!?]+(?:\s+|$)/).filter((chunk) => words(chunk) > 0);
  if (sentences.length > 0 && total / sentences.length > MAX_AVERAGE) {
    problems.push({ line: 1, rule: 'overview-sentences', message: `sentences average ${(total / sentences.length).toFixed(1)} words, at most ${MAX_AVERAGE}` });
  }
  return problems.sort((a, b) => a.line - b.line);
}

/** `Built so far: <k> of <n> parts.`, k the record's slices whose state starts `integrated`. */
export function builtLine(record) {
  const slices = record?.slices ?? [];
  const built = slices.filter((row) => String(row?.state ?? '').startsWith('integrated')).length;
  return `Built so far: ${built} of ${slices.length} parts.`;
}

/** `## Overview`, the artefact's text, then the built line; null when the artefact has no overview. */
export function overviewBlock(markdown, record) {
  const text = overviewOf(markdown);
  return text === null ? null : `## Overview\n\n${text}\n\n${builtLine(record)}`;
}
