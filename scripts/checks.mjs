/**
 * The **Checks** seam (ci-gate spec 7, 9, 10; L1-L4, A2): one commit's host checks read as one **Verdict**, the gate
 * land and a gate2 pass on it, and the **Check line** every step prints. Host and git are injected; nothing here
 * starts a process of its own. A host that cannot answer is **Unread**, never green.
 *
 * @typedef {{ state: 'green'|'red'|'pending'|'none'|'unread', sha: string, failed: string[], pending: string[],
 *   why?: string }} Verdict
 */

import { FULL_SHA } from '../deck/host-github.mjs';

const OUTCOMES = new Set(['pass', 'fail', 'pending']);
/** A workflow file GitHub runs (top level of `.github/workflows`) or GitLab's one file. */
const CI_FILE = /^(?:\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml)$/;
const LINE = /^checks (green|red|pending|none|unread) at ([0-9a-f]{7})(?:: (\S.*))?$/;

/** `sha`, or a throw when it is not a full commit sha, before any host or git call (spec 10). */
function fullSha(sha) {
  if (typeof sha !== 'string' || !FULL_SHA.test(sha)) throw new TypeError(`checks: ${JSON.stringify(sha)} is not a full commit sha`);
  return sha;
}

/** The first line a failure says: the CLI's stderr before the error's own message, which only names the command. */
const firstLine = (err) => String(err?.stderr?.trim() || (err?.message ?? err)).split(/\r?\n/)[0] || 'no answer';

/** The **Verdict** on `sha` (L3): red if any check failed, else pending if any is, else green; none at zero. */
export function checksAt({ host, sha }) {
  fullSha(sha);
  const verdict = (state, failed = [], pending = [], why = undefined) => ({ state, sha, failed, pending, ...(why === undefined ? {} : { why }) });
  if (host === null) return verdict('none', [], [], 'no host');
  let checks;
  try {
    checks = host.checks(sha);
    if (!Array.isArray(checks) || !checks.every((check) => typeof check?.name === 'string' && OUTCOMES.has(check.outcome))) {
      throw new Error('checks: an answer that is not the shape');
    }
  } catch (err) {
    return verdict('unread', [], [], firstLine(err));
  }
  const named = (outcome) => checks.filter((check) => check.outcome === outcome).map((check) => check.name);
  const [failed, pending] = [named('fail'), named('pending')];
  return verdict(failed.length > 0 ? 'red' : pending.length > 0 ? 'pending' : checks.length > 0 ? 'green' : 'none', failed, pending);
}

/** True when the tree at `sha` holds a workflow file or `.gitlab-ci.yml` (**CI configured**). `git` is argv only. */
export function ciConfigured(git, sha) {
  // `-z`: a name git would quote (non-ASCII bytes) is printed raw, so it is never missed.
  const files = git(['ls-tree', '-r', '-z', '--name-only', fullSha(sha), '--', '.github/workflows', '.gitlab-ci.yml']);
  return files.split('\0').some((file) => CI_FILE.test(file));
}

/**
 * The land and gate2 gate (L4, A2): ok on green, and on none only with no host or where CI is not configured,
 * noted in the line. An unreadable tree counts as configured, so the gate stays shut.
 */
export function checksGate({ host, git, sha, at }) {
  if (at !== 'land' && at !== 'gate2') throw new TypeError(`checks: a gate at ${JSON.stringify(at)}, not land or gate2`);
  const verdict = checksAt({ host, sha });
  const pass = (said) => ({ ok: true, line: checkLine(said), verdict: said });
  if (verdict.state === 'green' || (verdict.state === 'none' && verdict.why === 'no host')) return pass(verdict);
  if (verdict.state === 'none') {
    let configured = true;
    try {
      configured = ciConfigured(git, sha);
    } catch {
      // Unreadable: configured stays true, and the refusal below is the answer.
    }
    if (!configured) return pass({ ...verdict, why: 'no CI configured' });
  }
  return { ok: false, line: checkLine(verdict), verdict };
}

/** The **Check line**: `checks <state> at <sha7>[: <names>]`, the failed or pending names, else the why. */
export function checkLine({ state, sha, failed = [], pending = [], why }) {
  const names = state === 'red' ? failed : state === 'pending' ? pending : why === undefined ? [] : [why];
  return `checks ${state} at ${sha.slice(0, 7)}${names.length > 0 ? `: ${names.join(', ')}` : ''}`;
}

/** A **Check line** read back, or null when `line` is not one. A name holding `, ` reads back as two. */
export function parseCheckLine(line) {
  const [, state, sha7, names] = LINE.exec(String(line)) ?? [];
  return state === undefined ? null : { state, sha7, names: names === undefined ? [] : names.split(', ') };
}
