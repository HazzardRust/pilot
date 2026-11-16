/**
 * The host: the one module that starts a `gh` process (deck-writes-github spec 8; L1, L3). Every
 * GitHub call the deck and its scripts make goes through `hostIn`, so a second host is one
 * adapter, and a call outside `HOST_VERBS` is refused before any process starts.
 *
 * The call stays `execFileSync('gh', argv)`, no shell, so `pilot gh-stub` (ADR 0173) intercepts
 * it by PATH.
 */

import { execFileSync } from 'node:child_process';

/** What the host may run: `pr <verb>`, `api user` read, and an issue comment's `api` POST or PATCH. */
export const HOST_VERBS = Object.freeze([
  'pr create', 'pr edit', 'pr comment', 'pr view', 'pr list',
  'api user', 'api POST repos/<owner>/<repo>/issues/<n>/comments', 'api PATCH repos/<owner>/<repo>/issues/comments/<id>',
]);

const PR_VERBS = new Set(['create', 'edit', 'comment', 'view', 'list']);
const SEGMENT = '[A-Za-z0-9_.-]+';
const COMMENT_PATH = {
  POST: new RegExp(`^repos/${SEGMENT}/${SEGMENT}/issues/\\d+/comments$`),
  PATCH: new RegExp(`^repos/${SEGMENT}/${SEGMENT}/issues/comments/\\d+$`),
};
/** `gh api` flags that take a value; any other flag is refused rather than guessed at. */
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '--raw-field', '-F', '--field', '--jq', '-q']);
/** Flags that make `gh api` send a body, and so turn a GET into a POST. */
const BODY_FLAGS = new Set(['-f', '--raw-field', '-F', '--field', '--input']);

/** True when `args` is a `gh api` call in the table: `api user` with only `--jq`, or a comment POST or PATCH. */
function apiAllowed(args) {
  let method = null;
  let target = null;
  let sendsBody = false;
  for (let at = 1; at < args.length; at++) {
    const arg = args[at];
    if (!arg.startsWith('-')) {
      if (target !== null) return false;
      target = arg;
      continue;
    }
    if (!API_VALUE_FLAGS.has(arg) || at + 1 >= args.length) return false;
    const value = args[++at];
    if (arg === '-X' || arg === '--method') {
      if (method !== null) return false;
      method = value.toUpperCase();
    }
    if (BODY_FLAGS.has(arg)) sendsBody = true;
  }
  if (method === null) return target === 'user' && !sendsBody;
  return Object.hasOwn(COMMENT_PATH, method) && COMMENT_PATH[method].test(target ?? '');
}

/** Throws, naming the verb, unless `args` is a call `HOST_VERBS` holds. */
function assertHostVerb(args) {
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new Error('gh: the host takes an argv of strings');
  const [group, verb] = args;
  if (group === 'pr' && PR_VERBS.has(verb)) return;
  if (group === 'api' && apiAllowed(args)) return;
  throw new Error(`gh ${[group, verb].filter((word) => word !== undefined).join(' ')}: not a host verb`);
}

/** The host's runner in `cwd`: `(args) => stdout`, argv only, no shell; throws on a verb outside `HOST_VERBS`. */
export const hostIn = (cwd) => (args) => {
  assertHostVerb(args);
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
};
