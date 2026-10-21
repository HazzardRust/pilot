/**
 * Whether a QA walkthrough is a look rather than a script (walkthrough-taste spec 2, L2–L6,
 * ADR 0090): no step may ask the user to run a command. Pure: the steps in, the gaps out,
 * so `postItem` refuses before it reads the store. No step count is checked (L6). The body is
 * capped in lines, not characters (short-by-default spec 3, L3): the checks table goes in the PR's QA comment,
 * unless `longer` says in one line why it needs more room (L3, overridden on itm_03d153719048).
 */

import { stepParts } from './items.mjs';

const COMMANDS = ['npm', 'npx', 'node', 'pilot', 'git', 'gh', 'curl', 'cd', 'set', 'export', 'bash', 'sh', 'pwsh', 'powershell', 'python', 'pip'];
const CODE_SPAN = /`([^`\n]+)`/g;
const SPAN_PREFIX = /^(\$env:|\$|\.\/|\.\\)/;
const ENV_ASSIGNMENT = /(?<![\w$:])([A-Z][A-Z0-9_]*=)\S/;
// `pilot:` (a colon) is a name, `pilot ` (a space) a command; case matters, so "Set the theme" is prose.
const LEADING_COMMAND = new RegExp(`^(${COMMANDS.join('|')}) `);

/** The word that makes `half` a command, or null. Never the half's text (L5). */
function commandWord(half, isInstruction) {
  for (const [, span] of half.matchAll(CODE_SPAN)) {
    const code = span.trim();
    const first = code.split(/\s+/)[0];
    if (COMMANDS.includes(first)) return first;
    const prefix = SPAN_PREFIX.exec(code);
    if (prefix) return prefix[1];
  }
  const assignment = ENV_ASSIGNMENT.exec(half);
  if (assignment) return assignment[1];
  if (half.includes('$env:')) return '$env:';
  const leading = isInstruction ? LEADING_COMMAND.exec(half) : null;
  if (leading) return leading[1];
  if (half.includes('&&')) return '&&';
  return null;
}

export const MAX_WALKTHROUGH_BODY_LINES = 10; // non-blank lines

/** The gaps in a QA walkthrough, each worded as the refusal says it; [] when shaped. */
export function walkthroughShapeGaps(screens, body = '', longer = undefined) {
  const steps = screens.flatMap((step, index) => {
    const { instruction, result } = stepParts(step);
    const word = commandWord(instruction, true) ?? commandWord(result ?? '', false);
    return word === null ? [] : [`step ${index + 1} has a command: \`${word}\``];
  });
  const count = body.split(/[\r\n]/).filter((line) => line.trim() !== '').length;
  if (longer || count <= MAX_WALKTHROUGH_BODY_LINES) return steps;
  return [...steps, `the body is ${count} lines, at most ${MAX_WALKTHROUGH_BODY_LINES}; the checks table goes in the PR's QA comment; or say in one line why it needs more room, as longer`];
}
