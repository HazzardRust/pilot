/**
 * A main-cut run's ADR number on its feature branch (audit-f14 spec 9; L7). `mergeIntoPilot`
 * calls `afterGreen` in the landing worktree once the merge's suite is green and before pilot is
 * pushed: the rename is committed on feat there, the merge is made again with it as its second
 * parent, feat is pushed to origin, and only then does pilot move. A red suite never reaches it,
 * so no number is pushed that pilot does not take.
 */

import { allocateAdr } from './adr-allocate.mjs';
import { assertPushable, git } from './pilot-branch.mjs';

/**
 * Allocates the feature's placeholder ADR on the feature, in the worktree `dir` whose HEAD is the
 * tested landing merge (its first parent pilot's tip). Leaves HEAD at the same merge tree with the
 * number, its second parent the numbered feature commit, which is pushed to origin's `feat/<slug>`,
 * never forced. Answers `{ from, to }`, or null, nothing committed or pushed, with no placeholder.
 * A failure puts HEAD back at the merge and throws; pilot is not pushed then.
 */
export function afterGreen(dir) {
  const at = (...args) => git(dir, ...args);
  const merge = at('rev-parse', 'HEAD');
  const pilotTip = at('rev-parse', 'HEAD^1');
  const { tip, head } = featureOf(dir, merge);
  try {
    at('checkout', '-q', '--detach', tip);
    const adr = allocateAdr(dir, { since: pilotTip, onto: 'branch' });
    if (adr === null) {
      at('checkout', '-q', '--detach', merge);
      return null;
    }
    const numbered = at('rev-parse', 'HEAD');
    // Pilot's merge keeps its tested tree, a lander's resolution included, with the same allocation.
    at('checkout', '-q', '--detach', merge);
    const same = allocateAdr(dir, { since: pilotTip });
    if (same?.to !== adr.to) throw new Error(`the merge numbers ${adr.from} ${same?.to}, the feature ${adr.to}`);
    const message = at('log', '-1', '--format=%B', merge);
    const remerged = git(dir, 'commit-tree', 'HEAD^{tree}', '-p', pilotTip, '-p', numbered, '-m', message);
    at('checkout', '-q', '--detach', remerged);
    const ref = `${numbered}:refs/heads/${head}`;
    assertPushable(ref, { git: (args) => git(dir, ...args) });
    at('push', '-q', 'origin', ref);
    return adr;
  } catch (err) {
    at('reset', '-q', '--hard', merge);
    throw err;
  }
}

/**
 * The feature the landing merge `merge` holds: the local `feat/*` branch whose tip is its second
 * parent, or, for a lander's resolution merged again, the second parent's, followed down.
 */
function featureOf(dir, merge) {
  const tips = new Map();
  for (const line of git(dir, 'for-each-ref', '--format=%(objectname) %(refname:short)', 'refs/heads/feat/').split('\n').filter(Boolean)) {
    const [sha, name] = line.split(' ');
    tips.set(sha, tips.has(sha) ? null : name);
  }
  for (let at = git(dir, 'rev-parse', `${merge}^2`); ; ) {
    if (tips.has(at)) {
      const head = tips.get(at);
      if (head === null) throw new Error(`two feat/ branches point at ${at.slice(0, 7)}`);
      return { tip: at, head };
    }
    try {
      at = git(dir, 'rev-parse', '-q', '--verify', `${at}^2`);
    } catch {
      throw new Error(`no feat/ branch is the second parent of ${merge.slice(0, 7)}`);
    }
  }
}
