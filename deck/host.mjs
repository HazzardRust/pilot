/**
 * The host: the one module that starts a `gh` process (deck-writes-github spec 8; L1, L3). Every
 * GitHub call the deck and its scripts make goes through `hostIn`: one process start and one argv
 * allowlist (`assertHostVerb`), so a call outside the list is refused before any process starts.
 *
 * The call stays `execFileSync('gh', argv)`, no shell, so `pilot gh-stub` (ADR 0173) intercepts
 * it by PATH.
 */

import { execFileSync } from 'node:child_process';

const PR_VERBS = new Set(['create', 'edit', 'comment', 'view', 'list']);
/**
 * Flags no `pr <verb>` may carry, in any spelling: another repository (`-R`, `--repo`), a browser
 * (`-w`, `--web`) or an editor (`-e`, `--editor`). A short-flag cluster holding R, w or e (`-wR`,
 * `-w=true`) is refused whole. Values are tested too, so a value spelled like one of these is
 * refused: no caller sends one, and the refusal fails closed.
 */
const PR_REFUSED = /^-[A-Za-z]*[Rwe]|^--(?:repo|web|editor)(?:=|$)/;
/** One path segment, never `.` or `..`, so a path cannot climb out of `repos/<owner>/<repo>/`. */
const SEGMENT = '(?!\\.{1,2}/)[A-Za-z0-9_.-]+';
/** The one `gh api` write: a PATCH of an issue comment (`scripts/feature-pr.mjs`, QA's comment). */
const COMMENT_PATCH = new RegExp(`^repos/${SEGMENT}/${SEGMENT}/issues/comments/\\d+$`);
/**
 * `gh api` flags that take a value; any other flag is refused rather than guessed at. Never `-F`,
 * whose `@file` value reads a local file into the request.
 */
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '--jq']);

/** True when `args` is a `gh api` call on the list: `api user` with only `--jq`, or a comment PATCH. */
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
    if (arg === '-f') sendsBody = true;
  }
  if (method === null) return target === 'user' && !sendsBody;
  return method === 'PATCH' && COMMENT_PATCH.test(target ?? '');
}

/** Throws, naming the verb, unless `args` is on the host's allowlist. */
function assertHostVerb(args) {
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new Error('gh: the host takes an argv of strings');
  const [group, verb] = args;
  if (group === 'pr' && PR_VERBS.has(verb) && !args.some((arg) => PR_REFUSED.test(arg))) return;
  // `scripts/release.mjs` labels the release PR; a name must follow, never a flag.
  if (group === 'label' && verb === 'create' && args.length > 2 && !args[2].startsWith('-')) return;
  if (group === 'api' && apiAllowed(args)) return;
  throw new Error(`gh ${[group, verb].filter((word) => word !== undefined).join(' ')}: not a host verb`);
}

/** The host's runner in `cwd`: `(args) => stdout`, argv only, no shell; throws on a call off the allowlist. */
export const hostIn = (cwd) => (args) => {
  assertHostVerb(args);
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
};
