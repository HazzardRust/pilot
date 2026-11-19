/**
 * The GitHub adapter (other-host spec 2; L1, L4, L5): **Host** over `gh`. `ghRun` is the one place a `gh`
 * process starts, behind one argv allowlist (`assertHostVerb`), so a call outside the list is refused before
 * any process starts. The call stays `execFileSync('gh', argv)`, no shell, so `pilot gh-stub` (ADR 0173)
 * intercepts it by PATH. The pilot never reads a token: `gh` keeps its own, and `signedIn` reads an exit status.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
/** The one `gh api` write: a PATCH of an issue comment (`upsertComment`). */
const COMMENT_PATCH = new RegExp(`^repos/${SEGMENT}/${SEGMENT}/issues/comments/\\d+$`);
/** A full commit sha, lower-case hex: the only thing a checks read is by (ci-gate L1, spec 10). */
export const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** The one `gh api` read (ci-gate L2): this repository's latest check runs on one full sha, one page. */
const CHECK_RUNS = new RegExp(`^repos/\\{owner\\}/\\{repo\\}/commits/${FULL_SHA.source.slice(1, -1)}/check-runs\\?filter=latest&per_page=100$`);
/**
 * `gh api` flags that take a value; any other flag is refused rather than guessed at. Never `-F`,
 * whose `@file` value reads a local file into the request.
 */
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '--jq']);

/** True when `args` is a `gh api` call on the list: `api user` or the check-runs GET with only `--jq`, or a comment PATCH. */
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
  // No `-X GET` either: a GET is `gh api`'s default only while no `-f` rides along.
  if (method === null) return (target === 'user' || CHECK_RUNS.test(target ?? '')) && !sendsBody;
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

/** The `gh` runner in `cwd`: `(args) => stdout`, argv only, no shell; throws on a call off the allowlist. */
export const ghRun = (cwd) => (args, { timeout } = {}) => {
  assertHostVerb(args);
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...(timeout === undefined ? {} : { timeout }) });
};

const CHECKS_TIMEOUT_MS = 30_000;
/** The one field set every review read asks for (A2), whoever the caller. */
const FIELDS = 'number,state,baseRefName,headRefName,headRefOid,body,isCrossRepository';
const STATES = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' };
/** A comment's url as GitHub gives it: the repository and the comment's own id. */
const COMMENT_URL = /^https:\/\/[^/\s]+\/([\w.-]+)\/([\w.-]+)\/pull\/\d+#issuecomment-(\d+)$/;

/** A `gh` PR as a **Review**; a state off the three throws rather than being guessed at. */
function reviewOf(pr) {
  const state = STATES[pr?.state];
  if (state === undefined) throw new Error(`gh: a PR in state ${JSON.stringify(pr?.state)}`);
  return {
    number: pr.number, state, base: pr.baseRefName, head: pr.headRefName, headSha: pr.headRefOid,
    body: pr.body, crossRepo: pr.isCrossRepository,
  };
}

function json(said, what) {
  try {
    return JSON.parse(said);
  } catch {
    throw new Error(`gh ${what}: an answer that is not JSON`);
  }
}

const FAILED = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'stale']);
const PASSED = new Set(['success', 'neutral', 'skipped']);

/** A check run as a **Check** (ci-gate L3): not completed is pending; a conclusion off both lists throws, never guessed. */
function checkOf(run) {
  if (typeof run?.name !== 'string') throw new Error('gh api check-runs: a run with no name');
  const outcome = run.status !== 'completed' ? 'pending' : FAILED.has(run.conclusion) ? 'fail' : PASSED.has(run.conclusion) ? 'pass' : null;
  if (outcome === null) throw new Error(`gh api check-runs: ${run.name} concluded ${JSON.stringify(run.conclusion)}`);
  return { name: run.name, outcome };
}

/** A review number as its argv word; anything but a positive integer throws, so no flag rides in its slot. */
function numbered(n) {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`gh: ${JSON.stringify(n)} is not a PR number`);
  return String(n);
}

/** Calls `use(file)` with `body` in a temporary file, so a long body never rides on the command line. */
function withBodyFile(body, use) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-pr-'));
  try {
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, body, { mode: 0o600 });
    return use(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * **Host** over `run(args) -> stdout` (`ghRun(cwd)` in use, a fake in tests). A `label` is created first and
 * dropped from the write when `gh` cannot make it: a label never costs the PR.
 * @param {(args: string[], opts?: {timeout?: number}) => string} run
 * @returns {import('./host.mjs').Host}
 */
export function githubHost(run) {
  // `flags` are the write's label flags, `why` the first line of the refusal that dropped them (else absent).
  const labelled = (label, flag) => {
    if (label === undefined) return { flags: [] };
    try {
      run(['label', 'create', label, '--force']);
      return { flags: [flag, label] };
    } catch (err) {
      // `gh` says why on stderr; the error's own first line is only the command that failed.
      return { flags: [], why: String(err?.stderr?.trim() || (err?.message ?? err)).split('\n')[0] || 'label refused' };
    }
  };
  const withBody = (args, body) => (body === undefined ? run(args) : withBodyFile(body, (file) => run([...args, '--body-file', file])));
  const comments = (n) => {
    const said = json(run(['pr', 'view', numbered(n), '--json', 'comments']), 'pr view').comments;
    if (!Array.isArray(said)) throw new Error('gh pr view: no comments list');
    return said;
  };
  return {
    cli: 'gh',
    reviews({ head, base, state, mine = false, limit = 100 }) {
      const args = ['pr', 'list', ...(head === undefined ? [] : ['--head', head]), ...(base === undefined ? [] : ['--base', base]), '--state', state];
      const said = json(run([...args, ...(mine ? ['--author', '@me'] : []), '--json', FIELDS, '--limit', String(limit)]), 'pr list');
      if (!Array.isArray(said)) throw new Error('gh pr list: an answer that is not a list');
      return said.map(reviewOf);
    },
    review: (n) => reviewOf(json(run(['pr', 'view', numbered(n), '--json', FIELDS]), 'pr view')),
    open({ base, head, title, body, draft = false, label }) {
      const { flags, why } = labelled(label, '--label');
      const args = ['pr', 'create', ...(draft ? ['--draft'] : []), '--base', base, '--head', head, '--title', title, ...flags];
      const number = Number(/\/pull\/(\d+)\s*$/.exec(String(withBody(args, body)).trim())?.[1]);
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('gh pr create: no PR url in its answer');
      return why === undefined ? { number } : { number, why };
    },
    edit(n, { base, title, body, label } = {}) {
      const { flags: labels, why } = labelled(label, '--add-label');
      const flags = [...(base === undefined ? [] : ['--base', base]), ...(title === undefined ? [] : ['--title', title]), ...labels];
      withBody(['pr', 'edit', numbered(n), ...flags], body);
      return why === undefined ? {} : { why };
    },
    comment(n, body) {
      withBody(['pr', 'comment', numbered(n)], body);
    },
    /** One comment of this account per `marker` on review `n`: posted, edited in place, or left. Answers which. */
    upsertComment(n, marker, body) {
      const text = `${marker}\n${body}`;
      const mine = comments(n).find((each) => each?.viewerDidAuthor === true && typeof each.body === 'string' && each.body.startsWith(marker));
      if (!mine) {
        withBody(['pr', 'comment', numbered(n)], text);
        return 'posted';
      }
      // GitHub hands a comment back with CRLF line ends: the same text all the same.
      if (mine.body.replace(/\r\n/g, '\n').trimEnd() === text.replace(/\r\n/g, '\n').trimEnd()) return 'none';
      const [, owner, repo, id] = COMMENT_URL.exec(String(mine.url ?? '')) ?? [];
      if (id === undefined) throw new Error('gh pr view: the comment has no comment url');
      // `-f`, a raw string: the allowlist refuses `--input` and `-F`, whose `@file` reads a local file into the request.
      run(['api', `repos/${owner}/${repo}/issues/comments/${id}`, '--method', 'PATCH', '-f', `body=${text}`]);
      return 'edited';
    },
    /** The latest check runs on one full sha; runs past the one page throw rather than read as fewer. */
    checks(sha) {
      if (typeof sha !== 'string' || !FULL_SHA.test(sha)) throw new Error(`gh: ${JSON.stringify(sha)} is not a full commit sha`);
      // A hung `gh` expires into a throw, which `checksAt` reads as `unread`; no other `gh` call has a timeout.
      const said = json(run(['api', `repos/{owner}/{repo}/commits/${sha}/check-runs?filter=latest&per_page=100`], { timeout: CHECKS_TIMEOUT_MS }), 'api check-runs');
      if (!Array.isArray(said?.check_runs) || !Number.isSafeInteger(said.total_count)) throw new Error('gh api check-runs: an answer that is not the shape');
      if (said.total_count > said.check_runs.length) throw new Error(`gh api check-runs: ${said.total_count} runs, more than one page`);
      return said.check_runs.map(checkOf);
    },
    signedIn() {
      try {
        run(['api', 'user', '--jq', '.login']);
        return true;
      } catch {
        return false;
      }
    },
  };
}
