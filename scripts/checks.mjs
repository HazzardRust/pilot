/**
 * The **Checks** seam (ci-gate spec 7, 9, 10; L1-L4, A2): one commit's host checks read as one **Verdict**, the gate
 * land and a gate2 pass on it, and the **Check line** every step prints. Host and git are injected; nothing here
 * starts a process of its own. A host that cannot answer is **Unread**, never green.
 *
 * @typedef {{ state: 'green'|'red'|'pending'|'none'|'unread', sha: string, failed: string[], pending: string[],
 *   why?: string }} Verdict
 */

import { FULL_SHA } from '../deck/host-github.mjs';
import { outrunsProof } from './select-tests.mjs';

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

/** True on green, or on none with no host (A2): the pass rule land and a gate2 share before the CI-configured read. */
export const passes = ({ state, why }) => state === 'green' || (state === 'none' && why === 'no host');

/**
 * The land gate (L4, A2): ok on green, and on none only with no host or where CI is not configured,
 * noted in the line. An unreadable tree counts as configured, so the gate stays shut.
 */
export function checksGate({ host, git, sha }) {
  const verdict = checksAt({ host, sha });
  const pass = (said) => ({ ok: true, line: checkLine(said) });
  if (passes(verdict)) return pass(verdict);
  if (verdict.state === 'none') {
    let configured = true;
    try {
      configured = ciConfigured(git, sha);
    } catch {
      // Unreadable: configured stays true, and the refusal below is the answer.
    }
    if (!configured) return pass({ ...verdict, why: 'no CI configured' });
  }
  return { ok: false, line: checkLine(verdict) };
}

/** At least this many Gate jobs, one per OS, before a run proves anything (cheap-suite A2). */
const PROOF_JOBS = 3;

/**
 * The **Proof** a green CI run gives a landing (cheap-suite spec 5; L7, A2): the tree at least three `gate (<os>)`
 * jobs, each a different one, whose check runs sit on the exact tip `sha`, all passed and all named; or null with the
 * line saying why not. The tree is what the jobs checked out, a PR run's merge commit (F9), not `sha^{tree}`: the
 * caller diffs it against the tree it lands and tests the difference. `base...sha` touching `.github/` or a
 * `FULL_TRIGGERS` file is never proved, since the run it would trust is the one it changed.
 */
export function provenTree({ host, git, sha, base }) {
  fullSha(sha);
  fullSha(base);
  const none = (why) => ({ tree: null, line: `no ci proof: ${why}` });
  if (host === null) return none('no host');
  let changed;
  try {
    // `-z`: a name git would quote is printed raw; `--no-renames`: a file moved out of `.github/` still names it.
    changed = git(['diff', '--name-only', '--no-renames', '-z', `${base}...${sha}`, '--']).split('\0').filter(Boolean);
  } catch (err) {
    return none(`the feature diff is unreadable: ${firstLine(err)}`);
  }
  const trigger = changed.find(outrunsProof);
  if (trigger !== undefined) return none(`${trigger} changed`);
  let rows;
  try {
    rows = host.testedTrees(sha);
    if (!Array.isArray(rows) || !rows.every((row) => typeof row?.name === 'string')) throw new Error('testedTrees: an answer that is not the shape');
  } catch (err) {
    return none(firstLine(err));
  }
  const jobs = new Set(rows.map((row) => row.name)).size;
  if (jobs < PROOF_JOBS) return none(`${jobs} gate jobs, fewer than ${PROOF_JOBS}`);
  const failed = rows.find((row) => row.conclusion !== 'success');
  if (failed !== undefined) return none(`${failed.name} concluded ${failed.conclusion}`);
  const blank = rows.find((row) => typeof row.tree !== 'string' || !FULL_SHA.test(row.tree));
  if (blank !== undefined) return none(`${blank.name} named no tree`);
  const tree = rows[0].tree;
  if (rows.some((row) => row.tree !== tree)) return none('the gate jobs tested different trees');
  return { tree, line: `ci proved ${tree.slice(0, 7)} on ${rows.length} jobs` };
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
